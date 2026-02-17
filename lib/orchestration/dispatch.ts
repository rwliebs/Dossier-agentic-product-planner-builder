/**
 * Execution dispatch: fetch assignment + card + planned files,
 * retrieve memory (placeholder), build payload, dispatch to agentic-flow,
 * create AgentExecution, update status, log event.
 *
 * @see WORKTREE_MANAGEMENT_FLOW.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAgenticFlowClient,
  type DispatchPayload,
} from "./agentic-flow-client";
import { logEvent } from "./event-logger";
import {
  getCardAssignment,
  getOrchestrationRun,
  updateCardAssignmentStatus,
  ORCHESTRATION_TABLES,
} from "@/lib/supabase/queries/orchestration";
import {
  getCardById,
  getCardPlannedFiles,
  getCardRequirements,
} from "@/lib/supabase/queries";

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
 * Memory retrieval placeholder. Returns empty array until Memory Plane is implemented.
 */
async function retrieveMemoryForCard(
  _supabase: SupabaseClient,
  _cardId: string
): Promise<string[]> {
  return [];
}

/**
 * Dispatches a single assignment to agentic-flow.
 * Fetches assignment, run, card, planned files; builds payload; dispatches;
 * creates AgentExecution; updates assignment status; logs event.
 */
export async function dispatchAssignment(
  supabase: SupabaseClient,
  input: DispatchAssignmentInput
): Promise<DispatchAssignmentResult> {
  const { assignment_id, actor } = input;

  const assignment = await getCardAssignment(supabase, assignment_id);
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
    supabase,
    (assignment as { run_id: string }).run_id
  );
  if (!run) {
    return { success: false, error: "Orchestration run not found" };
  }

  const cardId = (assignment as { card_id: string }).card_id;
  const card = await getCardById(supabase, cardId);
  if (!card) {
    return { success: false, error: "Card not found" };
  }

  const plannedFiles = await getCardPlannedFiles(supabase, cardId);
  const approvedPlannedFiles = plannedFiles.filter(
    (f) => (f as { status?: string }).status === "approved"
  );
  if (approvedPlannedFiles.length === 0) {
    return {
      success: false,
      error: "Card has no approved planned files",
    };
  }

  const requirements = await getCardRequirements(supabase, cardId);
  const acceptanceCriteria = requirements.map(
    (r) => (r as { text?: string }).text ?? ""
  );
  const cardDesc = (card as { description?: string }).description;
  if (cardDesc) {
    acceptanceCriteria.unshift(cardDesc);
  }

  const memoryRefs = await retrieveMemoryForCard(supabase, cardId);

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

  const client = createAgenticFlowClient();
  const dispatchResult = await client.dispatch(payload);

  if (!dispatchResult.success) {
    await logEvent(supabase, {
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

  const { data: agentExec, error: insertError } = await supabase
    .from(ORCHESTRATION_TABLES.agent_executions)
    .insert({
      assignment_id,
      status: "running",
      started_at: new Date().toISOString(),
      summary: null,
      error: null,
    })
    .select("id")
    .single();

  if (insertError) {
    return {
      success: false,
      error: `Failed to create AgentExecution: ${insertError.message}`,
    };
  }

  await updateCardAssignmentStatus(supabase, assignment_id, "running");

  // Ensure run status is running when first assignment dispatched
  const runStatus = (run as { status?: string }).status;
  if (runStatus === "queued") {
    await supabase
      .from(ORCHESTRATION_TABLES.orchestration_runs)
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", (run as { id: string }).id);
  }

  await logEvent(supabase, {
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
