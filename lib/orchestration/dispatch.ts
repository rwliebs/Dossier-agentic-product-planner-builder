/**
 * Execution dispatch: fetch assignment + card + planned files,
 * retrieve memory, build payload, dispatch to agentic-flow,
 * create AgentExecution, update status, log event.
 *
 * @see docs/strategy/worktree-management-flow.md
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { MEMORY_PLANE } from "@/lib/feature-flags";
import {
  createAgenticFlowClient,
  type DispatchPayload,
} from "./agentic-flow-client";
import { logEvent } from "./event-logger";
import {
  getCardAssignment,
  getOrchestrationRun,
  updateCardAssignmentStatus,
} from "@/lib/db/queries/orchestration";
import {
  getArtifactById,
  getCardById,
  getCardContextArtifacts,
  getCardPlannedFiles,
  getCardRequirements,
} from "@/lib/db/queries";
import { getMemoryStore } from "@/lib/memory";
import { isRuvectorAvailable } from "@/lib/ruvector/client";

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
 * Dispatches a single assignment to agentic-flow.
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
  // Planned files are optional — use assignment's allowed_paths when none approved

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

  if (MEMORY_PLANE && memoryRefs.length === 0 && isRuvectorAvailable()) {
    console.warn(
      "[dispatch] Memory plane enabled but retrieval empty for card — consider ingesting card context before build (e.g. on finalize)."
    );
  }

  // Fetch context artifacts (test files, docs, specs) linked to this card
  const contextLinks = await getCardContextArtifacts(db, cardId);
  const contextArtifacts: Array<{ name: string; type: string; title?: string; content: string }> = [];
  for (const link of contextLinks) {
    const artifactId = (link as { context_artifact_id: string }).context_artifact_id;
    const artifact = await getArtifactById(db, artifactId);
    if (artifact && (artifact as { content?: string }).content) {
      contextArtifacts.push({
        name: (artifact as { name: string }).name,
        type: (artifact as { type: string }).type,
        title: (artifact as { title?: string }).title ?? undefined,
        content: (artifact as { content: string }).content ?? "",
      });
    }
  }

  // Build planned files detail (intent, contract notes, module hint)
  const plannedFilesDetail = approvedPlannedFiles.map((pf) => ({
    logical_file_name: (pf as { logical_file_name: string }).logical_file_name,
    action: (pf as { action?: string }).action ?? "edit",
    artifact_kind: (pf as { artifact_kind?: string }).artifact_kind ?? "component",
    intent_summary: (pf as { intent_summary?: string }).intent_summary ?? "",
    contract_notes: (pf as { contract_notes?: string }).contract_notes ?? undefined,
    module_hint: (pf as { module_hint?: string }).module_hint ?? undefined,
  }));

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
    card_title: (card as { title?: string }).title,
    card_description: (card as { description?: string }).description ?? undefined,
    planned_files_detail: plannedFilesDetail.length > 0 ? plannedFilesDetail : undefined,
    context_artifacts: contextArtifacts.length > 0 ? contextArtifacts : undefined,
  };

  const client = createAgenticFlowClient();
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

  // Sync card build_state to running; clear prior error for fresh build
  await db.updateCard(cardId, { build_state: "running", last_build_error: null });

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
