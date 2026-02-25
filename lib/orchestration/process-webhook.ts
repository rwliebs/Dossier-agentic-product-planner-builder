/**
 * Webhook processing for agentic-flow callbacks.
 * Handles: execution_started, commit_created, execution_completed, execution_failed.
 * Updates records, triggers checks on completion.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import {
  getCardAssignment,
  getOrchestrationRun,
  getAgentExecutionsByAssignment,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";
import { getCardById } from "@/lib/db/queries";
import { logEvent } from "./event-logger";
import { executeRequiredChecks } from "./execute-checks";
import { harvestBuildLearnings } from "@/lib/memory/harvest";
import { performAutoCommit } from "./auto-commit";

export type WebhookEventType =
  | "execution_started"
  | "commit_created"
  | "execution_completed"
  | "execution_failed"
  | "execution_blocked";

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
  /** Learnings from swarm memory (when real agentic-flow wired). Empty = harvest no-op. */
  learnings?: string[];
  /** Knowledge items discovered by the agent (facts, assumptions, questions) */
  knowledge?: {
    facts?: Array<{ text: string; evidence_source?: string }>;
    assumptions?: Array<{ text: string }>;
    questions?: Array<{ text: string }>;
  };
  /** Completion verification evidence (when execution_completed) */
  completion_evidence?: string;
}

export interface ProcessWebhookResult {
  success: boolean;
  error?: string;
}

/**
 * Writes knowledge items from webhook payload to the card.
 * Uses source: 'agent' and status: 'draft'.
 * Positions are sequential within each table (facts, assumptions, questions),
 * matching API routes that use items.length per type.
 */
async function writeKnowledgeToCard(
  db: DbAdapter,
  cardId: string,
  knowledge: WebhookPayload["knowledge"]
): Promise<void> {
  if (!knowledge) return;
  const now = new Date().toISOString();

  const [existingFacts, existingAssumptions, existingQuestions] = await Promise.all([
    db.getCardFacts(cardId),
    db.getCardAssumptions(cardId),
    db.getCardQuestions(cardId),
  ]);

  let factPosition = existingFacts.length;
  for (const fact of knowledge.facts ?? []) {
    await db.insertCardFact({
      card_id: cardId,
      text: fact.text,
      evidence_source: fact.evidence_source ?? null,
      status: "draft",
      source: "agent",
      position: factPosition++,
      created_at: now,
      updated_at: now,
    });
  }

  let assumptionPosition = existingAssumptions.length;
  for (const assumption of knowledge.assumptions ?? []) {
    await db.insertCardAssumption({
      card_id: cardId,
      text: assumption.text,
      status: "draft",
      source: "agent",
      position: assumptionPosition++,
      created_at: now,
      updated_at: now,
    });
  }

  let questionPosition = existingQuestions.length;
  for (const question of knowledge.questions ?? []) {
    await db.insertCardQuestion({
      card_id: cardId,
      text: question.text,
      status: "draft",
      source: "agent",
      position: questionPosition++,
      created_at: now,
      updated_at: now,
    });
  }
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
 * Processes an agentic-flow webhook event.
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
        actor: "agentic-flow",
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
        await db.updateAgentExecution((agentExec as { id: string }).id, {
          status: "completed",
          ended_at: payload.ended_at ?? new Date().toISOString(),
          summary: payload.summary ?? null,
          error: null,
        });
      }

      const cardId = (assignment as { card_id: string }).card_id;
      await writeKnowledgeToCard(db, cardId, payload.knowledge);

      const worktreePath = (assignment as { worktree_path?: string | null }).worktree_path;
      const featureBranch = (assignment as { feature_branch: string }).feature_branch;
      const allowedPaths = (assignment as { allowed_paths: string[] }).allowed_paths ?? [];

      let autoCommitOk = true;
      if (worktreePath) {
        const card = await getCardById(db, cardId);
        const cardTitle = (card as { title?: string } | null)?.title;
        const autoResult = performAutoCommit({
          worktreePath,
          featureBranch,
          cardTitle,
          cardId,
          allowedPaths,
        });

        if (autoResult.outcome === "committed") {
          await db.insertAgentCommit({
            assignment_id,
            sha: autoResult.sha,
            branch: featureBranch,
            message: autoResult.message,
            committed_at: new Date().toISOString(),
          });
          await logEvent(db, {
            project_id: projectId,
            run_id: runId,
            event_type: "commit_created",
            actor: "dossier-auto-commit",
            payload: {
              assignment_id,
              commit: { sha: autoResult.sha, branch: featureBranch, message: autoResult.message },
            },
          });
        } else if (autoResult.outcome === "no_changes") {
          autoCommitOk = false;
          await db.updateCardAssignment(assignment_id, { status: "blocked" });
          await db.updateCard(cardId, {
            build_state: "blocked",
            last_build_error: autoResult.reason ?? "No changes to commit",
          });
          await logEvent(db, {
            project_id: projectId,
            run_id: runId,
            event_type: "execution_blocked",
            actor: "dossier-auto-commit",
            payload: {
              assignment_id,
              summary: autoResult.reason,
            },
          });
        } else {
          autoCommitOk = false;
          await db.updateCardAssignment(assignment_id, { status: "failed" });
          await db.updateCard(cardId, {
            build_state: "failed",
            last_build_error: autoResult.error ?? "Auto-commit failed",
          });
          await logEvent(db, {
            project_id: projectId,
            run_id: runId,
            event_type: "execution_failed",
            actor: "dossier-auto-commit",
            payload: {
              assignment_id,
              error: autoResult.error,
            },
          });
        }
      }

      if (autoCommitOk) {
        await db.updateCardAssignment(assignment_id, { status: "completed" });
        await db.updateCard(cardId, {
          build_state: "completed",
          last_built_at: new Date().toISOString(),
          last_build_error: null,
        });
      }

      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_completed",
        actor: "agentic-flow",
        payload: {
          assignment_id,
          summary: payload.summary,
        },
      });

      // Trigger checks on completion (only when auto-commit succeeded or was skipped)
      const checkResult = autoCommitOk
        ? await executeRequiredChecks(db, runId)
        : { success: false, error: "Skipped: auto-commit failed or no changes" };
      if (!checkResult.success) {
        console.warn(
          `Webhook: checks failed for run ${runId}:`,
          checkResult.error
        );
      }

      // Harvest build learnings into memory (M4.5) — skip when memory plane disabled
      const { MEMORY_PLANE } = await import("@/lib/feature-flags");
      if (MEMORY_PLANE) {
        await harvestBuildLearnings(db, {
          assignmentId: assignment_id,
          runId,
          cardId,
          projectId,
          workflowId: (run as { workflow_id?: string }).workflow_id ?? null,
          learnings: payload.learnings ?? [],
        });
      }

      // Close run when all assignments are terminal so trigger-build lock is released.
      // "blocked" is NOT terminal: blocked assignments wait for user input and can resume.
      const assignments = await getCardAssignmentsByRun(db, runId);
      const terminalStatuses = ["completed", "failed"];
      const allTerminal =
        assignments.length > 0 &&
        assignments.every((a) =>
          terminalStatuses.includes((a as { status?: string }).status ?? "")
        );
      if (allTerminal) {
        const runStatus = assignments.every(
          (a) => (a as { status?: string }).status === "completed"
        )
          ? "completed"
          : "failed";
        await db.updateOrchestrationRun(runId, {
          status: runStatus,
          ended_at: new Date().toISOString(),
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

      const failedCardId = (assignment as { card_id: string }).card_id;
      const errorMsg = payload.error ?? "Build failed";
      await db.updateCard(failedCardId, {
        build_state: "failed",
        last_build_error: errorMsg,
      });
      await writeKnowledgeToCard(db, failedCardId, payload.knowledge);

      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_failed",
        actor: "agentic-flow",
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

    case "execution_blocked": {
      if (agentExec) {
        await db.updateAgentExecution((agentExec as { id: string }).id, {
          status: "blocked",
          ended_at: payload.ended_at ?? new Date().toISOString(),
          summary: payload.summary ?? null,
          error: payload.error ?? null,
        });
      }
      await db.updateCardAssignment(assignment_id, {
        status: "blocked",
      });

      const blockedCardId = (assignment as { card_id: string }).card_id;
      await db.updateCard(blockedCardId, { build_state: "blocked" });
      await writeKnowledgeToCard(db, blockedCardId, payload.knowledge);

      await logEvent(db, {
        project_id: projectId,
        run_id: runId,
        event_type: "execution_blocked",
        actor: "agentic-flow",
        payload: {
          assignment_id,
          summary: payload.summary,
          knowledge: payload.knowledge,
        },
      });
      break;
    }

    default:
      return { success: false, error: `Unknown event_type: ${event_type}` };
  }

  return { success: true };
}
