/**
 * Full build trigger: create run, create assignments, dispatch.
 * Orchestrates the full lifecycle for Build button and Build All.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { createRun } from "./create-run";
import { createAssignment } from "./create-assignment";
import { dispatchAssignment } from "./dispatch";
import { logEvent } from "./event-logger";
import {
  getCardIdsByWorkflow,
  getCardPlannedFiles,
  getProject,
} from "@/lib/supabase/queries";
import { listOrchestrationRunsByProject } from "@/lib/supabase/queries/orchestration";

export interface TriggerBuildInput {
  project_id: string;
  scope: "workflow" | "card";
  workflow_id?: string | null;
  card_id?: string | null;
  trigger_type: "card" | "workflow" | "manual";
  initiated_by: string;
}

export interface TriggerBuildResult {
  success: boolean;
  runId?: string;
  assignmentIds?: string[];
  error?: string;
  validationErrors?: string[];
}

/**
 * Triggers a full build: creates run, assignments for each card, dispatches each.
 * Enforces single-build lock: rejects if any run with status=running exists for project.
 */
export async function triggerBuild(
  db: DbAdapter,
  input: TriggerBuildInput
): Promise<TriggerBuildResult> {
  // O10.6: Single-build lock — strategy-mandated safety
  const runningRuns = await listOrchestrationRunsByProject(db, input.project_id, {
    status: "running",
    limit: 1,
  });
  if (runningRuns.length > 0) {
    return {
      success: false,
      error: "Build in progress",
      validationErrors: ["A build is already running for this project. Wait for it to complete."],
    };
  }

  const project = await getProject(db, input.project_id);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  const repoUrl =
    (project as { repo_url?: string }).repo_url ?? "https://github.com/placeholder/repo";
  const baseBranch =
    (project as { default_branch?: string }).default_branch ?? "main";

  const cardIds =
    input.scope === "card" && input.card_id
      ? [input.card_id]
      : input.scope === "workflow" && input.workflow_id
        ? await getCardIdsByWorkflow(db, input.workflow_id)
        : [];

  if (cardIds.length === 0) {
    return {
      success: false,
      validationErrors: ["No cards in scope"],
    };
  }

  const runResult = await createRun(db, {
    project_id: input.project_id,
    scope: input.scope,
    workflow_id: input.workflow_id ?? null,
    card_id: input.card_id ?? null,
    trigger_type: input.trigger_type,
    initiated_by: input.initiated_by,
    repo_url: repoUrl,
    base_branch: baseBranch,
    run_input_snapshot: {
      card_ids: cardIds,
      triggered_at: new Date().toISOString(),
    },
  });

  if (!runResult.success) {
    return {
      success: false,
      error: runResult.error,
      validationErrors: runResult.validationErrors,
    };
  }

  const runId = runResult.runId!;

  await logEvent(db, {
    project_id: input.project_id,
    run_id: runId,
    event_type: "run_initialized",
    actor: input.initiated_by,
    payload: { scope: input.scope, card_ids: cardIds },
  });

  const assignmentIds: string[] = [];

  for (const cardId of cardIds) {
    const plannedFiles = await getCardPlannedFiles(db, cardId);
    const approved = plannedFiles.filter(
      (f) => (f as { status?: string }).status === "approved"
    );
    if (approved.length === 0) continue;

    const allowedPaths = approved.map(
      (f) => (f as { logical_file_name: string }).logical_file_name
    );
    const runIdShort = runId.slice(0, 8);
    const cardIdShort = cardId.slice(0, 8);
    const featureBranch = `feat/run-${runIdShort}-${cardIdShort}`;

    const assignResult = await createAssignment(db, {
      run_id: runId,
      card_id: cardId,
      agent_role: "coder",
      agent_profile: "default",
      feature_branch: featureBranch,
      worktree_path: null,
      allowed_paths: allowedPaths,
      forbidden_paths: null,
      assignment_input_snapshot: {
        card_id: cardId,
        planned_file_ids: approved.map((f) => (f as { id: string }).id),
      },
    });

    if (!assignResult.success) {
      console.warn(
        `Failed to create assignment for card ${cardId}:`,
        assignResult.error
      );
      continue;
    }

    if (assignResult.assignmentId) {
      assignmentIds.push(assignResult.assignmentId);

      const dispatchResult = await dispatchAssignment(db, {
        assignment_id: assignResult.assignmentId,
        actor: input.initiated_by,
      });

      if (!dispatchResult.success) {
        console.warn(
          `Failed to dispatch assignment ${assignResult.assignmentId}:`,
          dispatchResult.error
        );
      }
    }
  }

  return {
    success: true,
    runId,
    assignmentIds,
  };
}
