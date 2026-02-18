/**
 * Retrieval policy (M5).
 * Query RuVector for semantic matches → get memory_unit_ids → fetch content from DbAdapter.
 * Card-scoped approved first → project-scoped → never rejected. Log retrieval.
 *
 * @see REMAINING_WORK_PLAN.md §4 M5
 * @see docs/SECTION_4_MEMORY_COORDINATION_PROMPT.md
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { getMemoryStore } from "./index";

/**
 * Retrieve memory for a card. Uses MemoryStore (real or mock based on RuVector availability).
 * Policy: card-scoped approved first, then project-scoped. Never rejected.
 * Returns content strings suitable for swarm context injection.
 */
export async function retrieveForCard(
  db: DbAdapter,
  cardId: string,
  projectId: string,
  contextSummary: string,
  options?: { limit?: number }
): Promise<string[]> {
  const store = getMemoryStore(db);
  return store.retrieveForCard(cardId, projectId, contextSummary, options);
}
