/**
 * Execution dispatch: fetch assignment + card + planned files,
 * retrieve memory, build payload, dispatch to claude-flow,
 * create AgentExecution, update status, log event.
 *
 * @see docs/strategy/worktree-management-flow.md
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { MEMORY_PLANE } from "@/lib/feature-flags";
import {
  createClaudeFlowClient,
  type DispatchPayload,
} from "./claude-flow-client";
import { logEvent } from "./event-logger";
import {
  getCardAssignment,
  getOrchestrationRun,
  updateCardAssignmentStatus,
} from "@/lib/supabase/queries/orchestration";
import {
  getCardById,
  getCardPlannedFiles,
  getCardRequirements,
} from "@/lib/supabase/queries";
import { getMemoryStore } from "@/lib/memory";

export interface DispatchAssignmentInput {
  assignment_id: string;
  actor: string;
}

export interface DispatchAssignmentResult {
  success: boolean;
  executionId?: string;
  agentExecutionId?: string;
  error?: string;
}

/**
 * Dispatches a single assignment to claude-flow.
 * Fetches assignment, run, card, planned files; builds payload; dispatches;
 * creates AgentExecution; updates assignment status; logs event.
 */
export async function dispatchAssignment(
  db: DbAdapter,
  input: DispatchAssignmentInput
): Promise<DispatchAssignmentResult> {
  const { assignment_id, actor } = input;

  const assignment = await getCardAssignment(db, assignment_id);
  if (!assignment) {
    return { success: false, error: "Assignment not found" };
  }

  if ((assignment as { status?: string }).status !== "queued") {
    return {
      success: false,
      error: `Assignment not queued (status: ${(assignment as { status?: string }).status})`,
    };
  }

  const run = await getOrchestrationRun(
    db,
    (assignment as { run_id: string }).run_id
  );
  if (!run) {
    return { success: false, error: "Orchestration run not found" };
  }

  const cardId = (assignment as { card_id: string }).card_id;
  const card = await getCardById(db, cardId);
  if (!card) {
    return { success: false, error: "Card not found" };
  }

  const plannedFiles = await getCardPlannedFiles(db, cardId);
  const approvedPlannedFiles = plannedFiles.filter(
    (f) => (f as { status?: string }).status === "approved"
  );
  if (approvedPlannedFiles.length === 0) {
    return {
      success: false,
      error: "Card has no approved planned files",
    };
  }

  const requirements = await getCardRequirements(db, cardId);
  const acceptanceCriteria = requirements.map(
    (r) => (r as { text?: string }).text ?? ""
  );
  const cardDesc = (card as { description?: string }).description;
  if (cardDesc) {
    acceptanceCriteria.unshift(cardDesc);
  }

  const projectId = run.project_id as string;
  const contextSummary = [
    (card as { title?: string }).title,
    (card as { description?: string }).description,
  ]
    .filter(Boolean)
    .join(" ");
  const memoryRefs = MEMORY_PLANE
    ? await getMemoryStore(db).retrieveForCard(
        cardId,
        projectId,
        contextSummary || cardId,
        { limit: 10 }
      )
    : [];

  const payload: DispatchPayload = {
    run_id: (run as { id: string }).id,
    assignment_id,
    card_id: cardId,
    feature_branch: (assignment as { feature_branch: string }).feature_branch,
    worktree_path: (assignment as { worktree_path?: string }).worktree_path ?? null,
    allowed_paths: (assignment as { allowed_paths: string[] }).allowed_paths,
    forbidden_paths:
      (assignment as { forbidden_paths?: string[] }).forbidden_paths ?? null,
    assignment_input_snapshot:
      (assignment as { assignment_input_snapshot: Record<string, unknown> })
        .assignment_input_snapshot ?? {},
    memory_context_refs: memoryRefs,
    acceptance_criteria: acceptanceCriteria.filter(Boolean),
  };

  const client = createClaudeFlowClient();
  const dispatchResult = await client.dispatch(payload);

  if (!dispatchResult.success) {
    await logEvent(db, {
      project_id: (run as { project_id: string }).project_id,
      run_id: (run as { id: string }).id,
      event_type: "execution_failed",
      actor,
      payload: {
        assignment_id,
        error: dispatchResult.error,
      },
    });
    return {
      success: false,
      error: dispatchResult.error,
    };
  }

  const executionId = dispatchResult.execution_id;

  let agentExec: { id?: string } | null = null;
  try {
    agentExec = await db.insertAgentExecution({
      assignment_id,
      status: "running",
      started_at: new Date().toISOString(),
      summary: null,
      error: null,
    });
  } catch (insertError) {
    return {
      success: false,
      error: `Failed to create AgentExecution: ${insertError instanceof Error ? insertError.message : String(insertError)}`,
    };
  }

  await updateCardAssignmentStatus(db, assignment_id, "running");

  // Ensure run status is running when first assignment dispatched
  const runStatus = (run as { status?: string }).status;
  if (runStatus === "queued") {
    await db.updateOrchestrationRun((run as { id: string }).id, {
      status: "running",
      started_at: new Date().toISOString(),
    });
  }

  await logEvent(db, {
    project_id: (run as { project_id: string }).project_id,
    run_id: (run as { id: string }).id,
    event_type: "agent_run_started",
    actor,
    payload: {
      assignment_id,
      execution_id: executionId,
      agent_execution_id: agentExec?.id,
    },
  });

  return {
    success: true,
    executionId,
    agentExecutionId: agentExec?.id,
  };
}
