# Agent prompt: Fix failing RuVector snapshot integration test

Use this prompt in a new agent session to diagnose and fix the failing test.

---

## Task

Fix the failing Vitest case: **`__tests__/lib/memory/snapshots.test.ts`** → **"integration with real RuVector"** → **"appendCardSnapshot: returns true, namespaced ID is in RuVector"**.

The test runs only when `ruvectorAvailable` is true (i.e. `ruvector-core` is loadable). It currently **fails** (e.g. timeout ~5s or assertion failure). Make the test pass reliably without changing the intended behavior of `appendCardSnapshot` or the public RuVector client interface.

## Context

- **File under test:** `lib/memory/snapshots.ts` — `appendCardSnapshot()` builds a text from card title, description, `eventType`, `buildOutcome`, embeds it via `embedText()`, and inserts into RuVector with id `snapshot:card:${cardId}:${timestamp}`.
- **Test:** Mocks `getRuvectorClient` to return a **real** RuVector client from `createTestRuvectorClient()` (temp dir, fresh index). It then calls `appendCardSnapshot(...)`, embeds the **same** text, runs `client.search({ vector, k: 5 })`, and asserts that at least one result has `id.startsWith("snapshot:card:")` and `id` contains the card id. It cleans up inserted ids in `afterEach` via `cleanupRuvectorTestVectors`.
- **Helpers:** `__tests__/lib/ruvector-test-helpers.ts` — `ruvectorAvailable`, `createTestRuvectorClient()`, `cleanupRuvectorTestVectors(ids, client)`.
- **Client type:** `lib/ruvector/client.ts` — `VectorDbInstance` with `insert()`, `search()`, `delete()`.

## What to do

1. **Run the failing test** in isolation and capture the exact failure (assertion message or timeout):
   ```bash
   npm run test -- --run __tests__/lib/memory/snapshots.test.ts
   ```
2. **Diagnose:** Determine whether the failure is due to:
   - `appendCardSnapshot` returning `false` (e.g. RuVector insert throwing or client null).
   - `client.search()` returning an empty array or results without the expected `id` format.
   - Timing/flakiness (e.g. index not yet searchable after insert, or embedding model load race).
   - Mismatch between the text used in `appendCardSnapshot` and the text the test embeds for search (see `snapshots.ts` parts: title, description, eventType, buildOutcome — no `status` in test input).
3. **Fix:** Prefer fixes in this order:
   - **Test robustness:** If the RuVector implementation or embedding is async and the index is eventually consistent, add a short retry or small delay before search, or assert on `result === true` and on `client.len()` / `client.get(id)` if search semantics are undefined for a single vector.
   - **Test correctness:** If the test’s expected text or id format doesn’t match `appendCardSnapshot` (e.g. missing/extra fields), align the test with the implementation.
   - **Implementation:** If `appendCardSnapshot` or the test client usage is wrong (e.g. wrong id format, wrong search usage), fix the implementation or test usage and keep the test’s intent (snapshot stored and findable by id).
4. **Verify:** Re-run the test in isolation and the full test suite to ensure no regressions:
   ```bash
   npm run test -- --run __tests__/lib/memory/snapshots.test.ts
   npm run test -- --run
   ```

## Success criteria

- The test **"appendCardSnapshot: returns true, namespaced ID is in RuVector"** passes when `ruvectorAvailable` is true.
- The test still correctly skips when `ruvectorAvailable` is false (`describe.skipIf(!ruvectorAvailable)`).
- No change to the public behavior of `appendCardSnapshot` or `getRuvectorClient`/VectorDbInstance contract beyond what’s needed to make the test pass.
- Other tests in the repo still pass.

## Optional

- If the failure is due to RuVector’s `search` not returning the just-inserted vector, consider asserting on `client.get(insertId)` or `client.len()` after insert and documenting that search may be eventually consistent, or skip the search assertion when the index has only one vector and assert by id instead.
