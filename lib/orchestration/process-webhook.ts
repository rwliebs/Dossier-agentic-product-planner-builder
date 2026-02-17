/**
 * Webhook processing for agentic-flow callbacks.
 * Handles: execution_started, commit_created, execution_completed, execution_failed.
 * Updates records, triggers checks on completion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCardAssignment,
  getOrchestrationRun,
  getAgentExecutionsByAssignment,
  ORCHESTRATION_TABLES,
} from "@/lib/supabase/queries/orchestration";
import { logEvent } from "./event-logger";
import { executeRequiredChecks } from "./execute-checks";

export type WebhookEventType =
  | "execution_started"
  | "commit_created"
  | "execution_completed"
  | "execution_failed";

export interface WebhookPayload {
  event_type: WebhookEventType;
  execution_id?: string;
  assignment_id: string;
  run_id?: string;
  status?: string;
  summary?: string;
  error?: string;
  started_at?: string;
  ended_at?: string;
  commit?: {
    sha: string;
    branch: string;
    message: string;
  };
}

export interface ProcessWebhookResult {
  success: boolean;
  error?: string;
}

/**
 * Finds the most recent agent_execution for an assignment (by assignment_id or execution_id).
 */
async function findAgentExecution(
  supabase: SupabaseClient,
  assignmentId: string,
  executionId?: string
) {
  const executions = await getAgentExecutionsByAssignment(
    supabase,
    assignmentId
  );
  if (executions.length === 0) return null;
  if (executionId) {
    const match = executions.find(
      (e) => (e as { id?: string }).id === executionId
    );
    if (match) return match;
  }
  return executions[0];
}

/**
 * Processes an agentic-flow webhook event.
 */
export async function processWebhook(
  supabase: SupabaseClient,
  payload: WebhookPayload
): Promise<ProcessWebhookResult> {
  const { event_type, assignment_id } = payload;

  const assignment = await getCardAssignment(supabase, assignment_id);
  if (!assignment) {
    return { success: false, error: "Assignment not found" };
  }

  const run = await getOrchestrationRun(
    supabase,
    (assignment as { run_id: string }).run_id
  );
  if (!run) {
    return { success: false, error: "Orchestration run not found" };
  }

  const projectId = (run as { project_id: string }).project_id;
  const runId = (run as { id: string }).id;

  const agentExec = await findAgentExecution(
    supabase,
    assignment_id,
    payload.execution_id
  );

  switch (event_type) {
    case "execution_started": {
      if (agentExec) {
        await supabase
          .from(ORCHESTRATION_TABLES.agent_executions)
          .update({
            status: "running",
            started_at: payload.started_at ?? new Date().toISOString(),
          })
          .eq("id", (agentExec as { id: string }).id);
      }
      await logEvent(supabase, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_started",
        actor: "agentic-flow",
        payload: { assignment_id, execution_id: payload.execution_id },
      });
      break;
    }

    case "commit_created": {
      if (payload.commit && agentExec) {
        await supabase.from(ORCHESTRATION_TABLES.agent_commits).insert({
          assignment_id,
          sha: payload.commit.sha,
          branch: payload.commit.branch,
          message: payload.commit.message,
          committed_at: new Date().toISOString(),
        });
      }
      await logEvent(supabase, {
        project_id: projectId,
        run_id: runId,
        event_type: "commit_created",
        actor: "agentic-flow",
        payload: {
          assignment_id,
          commit: payload.commit,
        },
      });
      break;
    }

    case "execution_completed": {
      if (agentExec) {
        await supabase
          .from(ORCHESTRATION_TABLES.agent_executions)
          .update({
            status: "completed",
            ended_at: payload.ended_at ?? new Date().toISOString(),
            summary: payload.summary ?? null,
            error: null,
          })
          .eq("id", (agentExec as { id: string }).id);
      }
      await supabase
        .from(ORCHESTRATION_TABLES.card_assignments)
        .update({
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignment_id);

      await logEvent(supabase, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_completed",
        actor: "agentic-flow",
        payload: {
          assignment_id,
          summary: payload.summary,
        },
      });

      // Trigger checks on completion
      const checkResult = await executeRequiredChecks(supabase, runId);
      if (!checkResult.success) {
        console.warn(
          `Webhook: checks failed for run ${runId}:`,
          checkResult.error
        );
      }
      break;
    }

    case "execution_failed": {
      if (agentExec) {
        await supabase
          .from(ORCHESTRATION_TABLES.agent_executions)
          .update({
            status: "failed",
            ended_at: payload.ended_at ?? new Date().toISOString(),
            summary: payload.summary ?? null,
            error: payload.error ?? null,
          })
          .eq("id", (agentExec as { id: string }).id);
      }
      await supabase
        .from(ORCHESTRATION_TABLES.card_assignments)
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignment_id);

      await logEvent(supabase, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_failed",
        actor: "agentic-flow",
        payload: {
          assignment_id,
          error: payload.error,
        },
      });

      await supabase
        .from(ORCHESTRATION_TABLES.orchestration_runs)
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
      break;
    }

    default:
      return { success: false, error: `Unknown event_type: ${event_type}` };
  }

  return { success: true };
}
