/**
 * Memory Plane exports.
 * getMemoryStore returns real or mock based on RuVector availability.
 *
 * @see REMAINING_WORK_PLAN.md §4 Memory Plane
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { getDb } from "@/lib/db";
import { isRuvectorAvailable } from "@/lib/ruvector/client";
import { createMemoryStore } from "./store";

let _store: ReturnType<typeof createMemoryStore> | null = null;

/**
 * Get MemoryStore. Real adapter when RuVector available, mock otherwise.
 * Pass db when in a context that provides it (e.g. dispatch); otherwise uses getDb().
 */
export function getMemoryStore(db?: DbAdapter) {
  if (db) {
    return createMemoryStore(db, isRuvectorAvailable());
  }
  if (_store) return _store;
  const adapter = getDb();
  const available = isRuvectorAvailable();
  _store = createMemoryStore(adapter, available);
  return _store;
}

/** Reset for tests. */
export function resetMemoryStoreForTesting(): void {
  _store = null;
}

export { createMockMemoryStore, createMemoryStore } from "./store";
export type { MemoryStore, MemoryUnitContent, RetrievalScope } from "./store";
export { embedText } from "./embedding";
export { ingestMemoryUnit, ingestCardContext } from "./ingestion";
export type { IngestScope, IngestContentInput } from "./ingestion";
export { harvestBuildLearnings } from "./harvest";
export type { HarvestInput } from "./harvest";
export { retrieveForCard } from "./retrieval";
export { appendCardSnapshot } from "./snapshots";
export type { CardSnapshotInput } from "./snapshots";
