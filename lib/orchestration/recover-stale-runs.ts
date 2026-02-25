/**
 * Recovers runs stuck in "running" for too long (crash/disconnect recovery).
 * Updates run, assignments, and card build_state so the UI reflects reality.
 *
 * O10.6: Single-build lock — stale runs block new builds; this clears them.
 */

import type { DbAdapter } from "@/lib/db/adapter";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "@/lib/db/queries/orchestration";

const STALE_RUN_MINUTES = parseInt(
  process.env.DOSSIER_STALE_RUN_MINUTES ?? "0",
  10
);
const STALE_RUN_MS = STALE_RUN_MINUTES * 60 * 1000;

export async function recoverStaleRuns(
  db: DbAdapter,
  projectId: string
): Promise<number> {
  // 0 = disabled: no automatic timeout for execution runs
  if (STALE_RUN_MINUTES === 0) return 0;

  const runningRuns = await listOrchestrationRunsByProject(db, projectId, {
    status: "running",
    limit: 10,
  });

  let recovered = 0;
  for (const run of runningRuns) {
    const startedAt = (run as { started_at?: string }).started_at;
    const createdAt = (run as { created_at?: string }).created_at;
    const ts = startedAt ?? createdAt;
    if (!ts || Date.now() - new Date(ts).getTime() <= STALE_RUN_MS) continue;

    const runId = (run as { id: string }).id;

    // Update assignments and cards first so UI reflects failed state
    const assignments = await getCardAssignmentsByRun(db, runId);
    for (const a of assignments) {
      const assignmentId = (a as { id: string }).id;
      const cardId = (a as { card_id: string }).card_id;
      const status = (a as { status?: string }).status ?? "";

      // Only update non-terminal assignments (running, queued)
      if (status !== "completed" && status !== "failed" && status !== "blocked") {
        await db.updateCardAssignment(assignmentId, { status: "failed" });
        await db.updateCard(cardId, {
          build_state: "failed",
          last_build_error: `Build timed out or agent stopped (recovered after ${STALE_RUN_MINUTES}+ min)`,
        });
      }
    }

    await db.updateOrchestrationRun(runId, {
      status: "failed",
      ended_at: new Date().toISOString(),
    });
    recovered++;
  }

  return recovered;
}
