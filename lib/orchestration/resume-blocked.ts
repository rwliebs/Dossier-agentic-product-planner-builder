/**
 * Resume a blocked assignment: requeue and dispatch.
 * Used when user has answered card questions and wants to continue the build.
 *
 * @see docs/product/user-workflows-reference.md
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { dispatchAssignment } from "./dispatch";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";

export interface ResumeBlockedInput {
  project_id: string;
  card_id: string;
  actor?: string;
}

export interface ResumeBlockedResult {
  success: boolean;
  assignmentId?: string;
  runId?: string;
  error?: string;
  outcomeType?: "success" | "error";
  message?: string;
}

/**
 * Finds a blocked assignment for the card in a running run, requeues it, and dispatches.
 */
export async function resumeBlockedAssignment(
  db: DbAdapter,
  input: ResumeBlockedInput
): Promise<ResumeBlockedResult> {
  const { project_id, card_id, actor = "user" } = input;

  const runningRuns = await listOrchestrationRunsByProject(db, project_id, {
    status: "running",
    limit: 10,
  });

  let blockedAssignment: { id: string; run_id: string } | null = null;
  for (const run of runningRuns) {
    const assignments = await getCardAssignmentsByRun(db, (run as { id: string }).id);
    const match = assignments.find(
      (a) =>
        (a as { card_id: string }).card_id === card_id &&
        (a as { status?: string }).status === "blocked"
    );
    if (match) {
      blockedAssignment = {
        id: (match as { id: string }).id,
        run_id: (match as { run_id: string }).run_id,
      };
      break;
    }
  }

  if (!blockedAssignment) {
    return {
      success: false,
      error: "No blocked assignment found for this card",
      outcomeType: "error",
      message: "No blocked build found for this card. Start a new build instead.",
    };
  }

  await db.updateCardAssignment(blockedAssignment.id, { status: "queued" });
  await db.updateCard(card_id, { build_state: "queued" });

  const dispatchResult = await dispatchAssignment(db, {
    assignment_id: blockedAssignment.id,
    actor,
  });

  if (!dispatchResult.success) {
    await db.updateCardAssignment(blockedAssignment.id, { status: "blocked" });
    await db.updateCard(card_id, { build_state: "blocked" });
    return {
      success: false,
      error: dispatchResult.error,
      outcomeType: "error",
      message: dispatchResult.error ?? "Resume dispatch failed",
    };
  }

  return {
    success: true,
    assignmentId: blockedAssignment.id,
    runId: blockedAssignment.run_id,
    outcomeType: "success",
    message: "Build resumed — agent is working",
  };
}
