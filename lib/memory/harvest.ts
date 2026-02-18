/**
 * Build harvest pipeline (M4.5).
 * Post-build: read learnings from swarm memory, filter for durable knowledge,
 * run each through ingestion pipeline. Link to source card and project scope.
 *
 * @see REMAINING_WORK_PLAN.md §4 M4.5
 * @see docs/SECTION_4_MEMORY_COORDINATION_PROMPT.md
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { ingestMemoryUnit } from "./ingestion";

export interface HarvestInput {
  assignmentId: string;
  runId: string;
  cardId: string;
  projectId: string;
  workflowId?: string | null;
  activityId?: string | null;
  stepId?: string | null;
  /** Learnings from swarm memory. When empty, harvest is no-op. */
  learnings?: string[];
}

/**
 * Harvest build learnings into memory. No-op if learnings empty or RuVector unavailable.
 * Each learning is ingested as a MemoryUnit with card/project scope.
 */
export async function harvestBuildLearnings(
  db: DbAdapter,
  input: HarvestInput
): Promise<number> {
  const learnings = input.learnings ?? [];
  if (learnings.length === 0) return 0;

  const scope = {
    cardId: input.cardId,
    projectId: input.projectId,
    workflowId: input.workflowId ?? null,
    activityId: input.activityId ?? null,
    stepId: input.stepId ?? null,
  };

  let count = 0;
  for (const text of learnings) {
    const trimmed = text?.trim();
    if (!trimmed) continue;
    const id = await ingestMemoryUnit(
      db,
      { contentText: trimmed, title: "Build learning" },
      scope
    );
    if (id) count++;
  }
  return count;
}
