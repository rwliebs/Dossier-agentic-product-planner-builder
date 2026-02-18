/**
 * Webhook processing for claude-flow callbacks.
 * Handles: execution_started, commit_created, execution_completed, execution_failed.
 * Updates records, triggers checks on completion.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import {
  getCardAssignment,
  getOrchestrationRun,
  getAgentExecutionsByAssignment,
} from "@/lib/supabase/queries/orchestration";
import { logEvent } from "./event-logger";
import { executeRequiredChecks } from "./execute-checks";
import { harvestBuildLearnings } from "@/lib/memory/harvest";

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
  /** Learnings from swarm memory (when real claude-flow wired). Empty = harvest no-op. */
  learnings?: string[];
}

export interface ProcessWebhookResult {
  success: boolean;
  error?: string;
}

/**
 * Finds the most recent agent_execution for an assignment (by assignment_id or execution_id).
 */
async function findAgentExecution(
  db: DbAdapter,
  assignmentId: string,
  executionId?: string
) {
  const executions = await getAgentExecutionsByAssignment(
    db,
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
 * Processes a claude-flow webhook event.
 */
export async function processWebhook(
  db: DbAdapter,
  payload: WebhookPayload
): Promise<ProcessWebhookResult> {
  const { event_type, assignment_id } = payload;

  const assignment = await getCardAssignment(db, assignment_id);
  if (!assignment) {
    return { success: false, error: "Assignment not found" };
  }

  const run = await getOrchestrationRun(
    db,
    (assignment as { run_id: string }).run_id
  );
  if (!run) {
    return { success: false, error: "Orchestration run not found" };
  }

  const projectId = (run as { project_id: string }).project_id;
  const runId = (run as { id: string }).id;

  const agentExec = await findAgentExecution(
    db,
    assignment_id,
    payload.execution_id
  );

  switch (event_type) {
    case "execution_started": {
      if (agentExec) {
        await db.updateAgentExecution((agentExec as { id: string }).id, {
          status: "running",
          started_at: payload.started_at ?? new Date().toISOString(),
        });
      }
      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_started",
        actor: "claude-flow",
        payload: { assignment_id, execution_id: payload.execution_id },
      });
      break;
    }

    case "commit_created": {
      if (payload.commit && agentExec) {
        await db.insertAgentCommit({
          assignment_id,
          sha: payload.commit.sha,
          branch: payload.commit.branch,
          message: payload.commit.message,
          committed_at: new Date().toISOString(),
        });
      }
      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "commit_created",
        actor: "claude-flow",
        payload: {
          assignment_id,
          commit: payload.commit,
        },
      });
      break;
    }

    case "execution_completed": {
      if (agentExec) {
        await db.updateAgentExecution((agentExec as { id: string }).id, {
          status: "completed",
          ended_at: payload.ended_at ?? new Date().toISOString(),
          summary: payload.summary ?? null,
          error: null,
        });
      }
      await db.updateCardAssignment(assignment_id, {
        status: "completed",
      });

      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_completed",
        actor: "claude-flow",
        payload: {
          assignment_id,
          summary: payload.summary,
        },
      });

      // Trigger checks on completion
      const checkResult = await executeRequiredChecks(db, runId);
      if (!checkResult.success) {
        console.warn(
          `Webhook: checks failed for run ${runId}:`,
          checkResult.error
        );
      }

      // Harvest build learnings into memory (M4.5) — skip when memory plane disabled
      const { MEMORY_PLANE } = await import("@/lib/feature-flags");
      if (MEMORY_PLANE) {
        const cardId = (assignment as { card_id: string }).card_id;
        await harvestBuildLearnings(db, {
          assignmentId: assignment_id,
          runId,
          cardId,
          projectId,
          workflowId: (run as { workflow_id?: string }).workflow_id ?? null,
          learnings: payload.learnings ?? [],
        });
      }
      break;
    }

    case "execution_failed": {
      if (agentExec) {
        await db.updateAgentExecution((agentExec as { id: string }).id, {
          status: "failed",
          ended_at: payload.ended_at ?? new Date().toISOString(),
          summary: payload.summary ?? null,
          error: payload.error ?? null,
        });
      }
      await db.updateCardAssignment(assignment_id, {
        status: "failed",
      });

      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_failed",
        actor: "claude-flow",
        payload: {
          assignment_id,
          error: payload.error,
        },
      });

      await db.updateOrchestrationRun(runId, {
        status: "failed",
        ended_at: new Date().toISOString(),
      });
      break;
    }

    default:
      return { success: false, error: `Unknown event_type: ${event_type}` };
  }

  return { success: true };
}
