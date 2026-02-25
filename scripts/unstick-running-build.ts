/**
 * One-off: mark all running runs for a project as failed so the UI and build lock unblock.
 * Usage: npx tsx scripts/unstick-running-build.ts [projectId]
 */
import { getDb } from "../lib/db";
import {
  listOrchestrationRunsByProject,
  getCardAssignmentsByRun,
} from "../lib/db/queries/orchestration";

const projectId =
  process.argv[2] ?? "a058bdb3-f369-4bca-9bac-8123749e85d9";

async function main() {
  const db = getDb();
  const runningRuns = await listOrchestrationRunsByProject(db, projectId, {
    status: "running",
    limit: 20,
  });

  if (runningRuns.length === 0) {
    console.log("No runs stuck in 'running'. Done.");
    process.exit(0);
  }

  for (const run of runningRuns) {
    const runId = (run as { id: string }).id;
    const assignments = await getCardAssignmentsByRun(db, runId);
    for (const a of assignments) {
      const assignmentId = (a as { id: string }).id;
      const cardId = (a as { card_id: string }).card_id;
      const status = (a as { status?: string }).status ?? "";
      if (status === "completed" || status === "failed" || status === "blocked")
        continue;
      await db.updateCardAssignment(assignmentId, { status: "failed" });
      await db.updateCard(cardId, {
        build_state: "failed",
        last_build_error:
          "Build interrupted (server restarted or process killed). You can trigger a new build.",
      });
      console.log("Marked card", cardId.slice(0, 8), "as failed");
    }
    await db.updateOrchestrationRun(runId, {
      status: "failed",
      ended_at: new Date().toISOString(),
    });
    console.log("Marked run", runId.slice(0, 8), "as failed");
  }

  console.log("Done. UI should update; build lock released.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
