# Section 4 (Memory Plane) Agent Coordination Prompt

**Use this prompt when working on Section 4 (Memory Plane) to align with the coordinated parallel approach.**

---

## Pivot: Coordinated Parallel with Section 3

Section 4 is **not blocked** on Section 3. Proceed in parallel using these coordination points.

### What Section 3 Owns (already in progress)

- **DbAdapter memory methods** — Interface extended in `lib/db/adapter.ts`:
  - `insertMemoryUnit(row)` → `Promise<DbRow>`
  - `getMemoryUnitsByIds(ids)` → `Promise<DbRow[]>`
  - `insertMemoryUnitRelation(row)` → `Promise<void>`
  - `getMemoryUnitRelationsByEntity(entityType, entityId)` → `Promise<DbRow[]>`
  - `insertMemoryRetrievalLog(row)` → `Promise<DbRow>`

- **Memory migration** — `lib/db/sqlite-migrations/003_memory.sql` contains the memory schema.

### What Section 4 Owns

- **M1** RuVector local setup — Add package, configure data dir, verify embed + search cycle
- **M2** MemoryStore — `lib/memory/store.ts` has interface + mock. Implement real adapter when M1 + M3 ready
- **M4** Ingestion pipeline — `lib/memory/ingestion.ts`
- **M4.5** Build harvest pipeline — `lib/memory/harvest.ts`
- **M5** Retrieval policy — `lib/memory/retrieval.ts`
- **M6** Historical snapshots — `lib/memory/snapshots.ts`
- **M7** Orchestration wiring — Replace `retrieveMemoryForCard` in `dispatch.ts`, wire harvest in `process-webhook.ts` (execution_completed)
- **M8** Memory tests — Mock RuVector for unit tests

### How to Proceed

1. **Code against the interface** — All memory logic uses `DbAdapter` memory methods and `MemoryStore`. Never bypass the adapter for direct DB access.

2. **Use mock adapter until real one works** — `createMockMemoryStore()` returns empty results. Use it in:
   - Unit tests
   - `dispatch.ts` retrieval (until M5 wired)
   - Any code path when RuVector fails to initialize

3. **Fallback behavior** — If RuVector unavailable: mock adapter returns empty memory. Builds proceed. Ingestion/harvest are no-ops. Retrieval falls back to empty (non-semantic). Adapter swap is non-breaking.

4. **Harvest trigger** — Wire `harvestBuildLearnings()` into `process-webhook.ts` in the `execution_completed` case (after `executeRequiredChecks`). In self-deploy mode, webhooks may be in-process callbacks; same handler applies.

5. **Method signatures** — DbAdapter memory methods are fixed. If you need different shapes, propose changes in a comment or coordination doc; do not fork the interface.

### Task Order

1. M1 (RuVector setup) — Unblocks real adapter
2. M2 (MemoryStore real impl) — Once M1 + DbAdapter memory methods exist
3. M3 — Owned by Section 3; you specify schema (already in Strategy + migration)
4. M4, M4.5, M5, M6 — Can be written against interface + mock; will work when real adapter lands
5. M7 — Wire retrieval + harvest; use `getMemoryStore()` that returns real or mock based on availability
6. M8 — Tests throughout; mock RuVector for unit tests

### Files to Create/Modify

| File | Action |
|------|--------|
| `lib/memory/store.ts` | Exists. Implement `createMemoryStore(db, available)` real logic |
| `lib/memory/ingestion.ts` | Create |
| `lib/memory/harvest.ts` | Create |
| `lib/memory/retrieval.ts` | Create |
| `lib/memory/snapshots.ts` | Create |
| `lib/orchestration/dispatch.ts` | Replace `retrieveMemoryForCard` with MemoryStore.retrieveForCard |
| `lib/orchestration/process-webhook.ts` | Call harvest in execution_completed |

### Reference Docs

- [remaining-work-plan.md](../plans/remaining-work-plan.md) §4
- [dual-llm-integration-strategy.md](../strategy/dual-llm-integration-strategy.md) §Memory and Retrieval, §Storage Architecture
- `lib/db/adapter.ts` — DbAdapter interface (memory methods at bottom)
