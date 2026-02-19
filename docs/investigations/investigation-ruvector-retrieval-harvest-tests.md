# Investigation Report: retrieval.test.ts & harvest.test.ts (RuVector)

**Date:** 2026-02-18  
**Scope:** Root cause of failures in `__tests__/lib/memory/retrieval.test.ts` and `__tests__/lib/memory/harvest.test.ts`, suspected ruvector-related.

---

## 1. Rules Audit

- **Cursor AI Rules (repo_specific_rule):** Not found in context.
- **Mode-specific rules:** Investigator subagent — investigate root cause, set success criteria, produce report for fixer; do not implement fixes.
- **User rules:** Not enumerated.
- **Compliance:** Investigation only; no code fixes applied.

---

## 2. Expected Behavior

- **Expected (retrieval):** Integration test “retrieveForCard end-to-end” should ingest a memory unit (non-null ID), then retrieve by semantic query and get non-empty results containing “OAuth2” or “authentication”.
- **Expected (harvest):** Integration test “harvestBuildLearnings” should ingest learnings, return count > 0, and vectors should be searchable; embedding should use the real model when possible.
- **Source:** Test descriptions and assertions in `__tests__/lib/memory/retrieval.test.ts`, `__tests__/lib/memory/harvest.test.ts`; memory plane behavior in `lib/memory/ingestion.ts`, `lib/memory/embedding.ts`.

**Expected behavior established:** YES.

---

## 3. Exact Failure Summary

### 3.1 Test Runs

- **Command used:** `pnpm test __tests__/lib/memory/retrieval.test.ts __tests__/lib/memory/harvest.test.ts`
- **Exit code (current codebase):** 0 (both files pass; one test is skipped).
- **Previously observed failure (when integration test was not skipped):**
  - **File:** `__tests__/lib/memory/retrieval.test.ts`
  - **Test:** `Retrieval policy (M8) > integration with real RuVector > retrieveForCard end-to-end: ingest content, retrieve with semantically similar query, results non-empty`
  - **Assertion error:** `AssertionError: expected null not to be null`
  - **Location:** `__tests__/lib/memory/retrieval.test.ts:99:22` (or equivalent line for `expect(id).not.toBeNull()`)
  - **Meaning:** `ingestMemoryUnit(...)` returned `null`, so the test failed before checking retrieval results.

### 3.2 Current Behavior (No Assertion Failure)

- **retrieval.test.ts:** The integration test is **skipped** when `getRuvectorClient() === null` (see `it.skipIf(() => getRuvectorClient() === null)(...)`). So in environments where the RuVector client is null at test run time, the test does not run and no assertion fails.
- **harvest.test.ts:** All 6 tests **pass**. stderr shows an embedding loader error (see below); tests still pass because embedding falls back to hash-based vectors and harvest only asserts count > 0 and searchability.

### 3.3 stderr (RuVector / Embedding)

When the harvest integration test runs (or any code path that loads the embedder), stderr shows:

```
[embedding] Failed to load embedding model, using hash-based fallback: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '.../ruvector-onnx-embeddings-wasm/package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
```

- **Source:** `lib/memory/embedding.ts` → `loadEmbedder()` catch block (lines 60–66) when `createEmbedder()` fails.
- **Impact:** Embeddings in tests (and possibly in app when this path runs) use deterministic hash-based vectors, not the real ONNX model.

---

## 4. Data Flow

### 4.1 Retrieval integration test

- **Flow:** Test → `ingestMemoryUnit(sqliteDb, input, scope)` → `getRuvectorClient()` (mocked to real impl) → `embedText(...)` → `rv.insert({ id, vector })` → `db.insertMemoryUnit(row)` + `db.insertMemoryUnitRelation(...)` → returns `memoryUnitId`. Then `retrieveForCard(sqliteDb, cardId, projectId, query)` → `getMemoryStore(db)` → `store.retrieveForCard(...)` (uses `getRuvectorClient()` and DB).
- **Null return from `ingestMemoryUnit`:** Only in three cases (see `lib/memory/ingestion.ts`):
  1. `getRuvectorClient()` is null (line 46–47).
  2. `contentText` is empty and not a link (line 49–50) — not the case here.
  3. `rv.insert(...)` throws (line 63–65, catch returns null).

So the failure “expected null not to be null” implies either **(A)** `getRuvectorClient()` returned null when called from `ingestMemoryUnit`, or **(B)** `rv.insert(...)` threw and the catch returned null.

### 4.2 Harvest integration test

- **Flow:** `harvestBuildLearnings(db, input)` → for each learning, `ingestMemoryUnit(db, { contentText, title }, scope)` (same as above). Embedding is via `embedText()` which uses `ruvector-onnx-embeddings-wasm/loader.js` → `createEmbedder()` → dynamic `import('./ruvector_onnx_embeddings_wasm.js')`, which triggers the ESM/CJS error.

### 4.3 RuVector usage in failing tests

| Component            | API / dependency                         | File(s) |
|----------------------|------------------------------------------|---------|
| Client singleton     | `getRuvectorClient()`, `resetRuvectorForTesting()` | `lib/ruvector/client.ts` |
| Mock in tests        | `vi.mock("@/lib/ruvector/client")`, `realGetRuvectorClient` | retrieval.test.ts, harvest.test.ts |
| Ingestion            | `getRuvectorClient()`, `rv.insert()`      | `lib/memory/ingestion.ts` |
| Embedding            | `ruvector-onnx-embeddings-wasm/loader.js` → `createEmbedder()` | `lib/memory/embedding.ts` |
| Loader → WASM        | `import('./ruvector_onnx_embeddings_wasm.js')` | `node_modules/ruvector-onnx-embeddings-wasm/loader.js` (line 283) |

---

## 5. Root Cause Analysis

### 5.1 Retrieval: `ingestMemoryUnit` returns null

- **Observed:** Integration test fails with `expect(id).not.toBeNull()` when the test is not skipped.
- **Root cause (two possible branches):**
  1. **Client null:** When `ingestMemoryUnit` runs, `getRuvectorClient()` (real implementation via mock) returns null. That happens in `lib/ruvector/client.ts` when `isRuvectorAvailable()` is false or when the `try { require("ruvector-core"); ... new VectorDb(...); }` block throws and the `catch` returns null (lines 72–88). So either `require("ruvector-core")` or `new VectorDb(...)` fails in the test environment (e.g. native addon / resolution in Vitest).
  2. **Insert throws:** Client is non-null but `rv.insert({ id: memoryUnitId, vector: vec })` throws (e.g. dimension mismatch, storage path, or ruvector-core bug). The catch in `ingestion.ts` (lines 63–65) then returns null.

**Evidence:** `lib/memory/ingestion.ts` lines 46–47 (return null if no client), 63–65 (return null if insert throws). No logging in the catch, so which branch occurred is not visible from the current code.

**Alternatives considered:** Test order / env could affect whether `ruvector-core` loads (e.g. retrieval run alone vs with harvest); current workaround is `it.skipIf(() => getRuvectorClient() === null)` so the test is skipped when client is null.

### 5.2 Embedding: “module is not defined in ES module scope”

- **Observed:** `[embedding] Failed to load embedding model, using hash-based fallback: module is not defined in ES module scope` (and the “.js file … type: module … use .cjs” message).
- **Root cause:** Package `ruvector-onnx-embeddings-wasm` has `"type": "module"` in `package.json`, so all `.js` files are treated as ESM. The file `ruvector_onnx_embeddings_wasm.js` uses CommonJS (`module.exports`, `module.require`, `require('fs')`) at top level. When the loader (ESM) does `await import('./ruvector_onnx_embeddings_wasm.js')`, Node/Vitest run that file as ESM, where `module` is undefined → “module is not defined in ES module scope”.
- **Source:**  
  - `node_modules/ruvector-onnx-embeddings-wasm/ruvector_onnx_embeddings_wasm.js` line 3: `imports['__wbindgen_placeholder__'] = module.exports;`; lines 566, 631 use `module.require` and `require('fs')`.  
  - `node_modules/ruvector-onnx-embeddings-wasm/loader.js` line 283: `wasmModule = await import('./ruvector_onnx_embeddings_wasm.js');`  
  - `lib/memory/embedding.ts` lines 55–56: `import("ruvector-onnx-embeddings-wasm/loader.js")`, then `createEmbedder(model)`.

**Alternatives considered:** Use a different entry point if the package provides an ESM build; patch or fork the package; mock the embedder in tests so integration tests don’t depend on the broken loader in Vitest.

---

## 6. Uncertainty Register

- **KNOWN:** (1) `ingestMemoryUnit` returns null only when client is null or `rv.insert()` throws. (2) Embedding failure is caused by CJS/ESM mismatch in `ruvector_onnx_embeddings_wasm.js`. (3) Harvest passes with hash fallback; retrieval integration test is skipped when `getRuvectorClient() === null`.
- **UNKNOWN:** In the run where the retrieval test failed (id === null), whether the cause was client null or `rv.insert()` throwing (no logging in ingestion catch).
- **ASSUMED:** None blocking.
- **Status:** CLEAR for report; fixer may add temporary logging to distinguish client-null vs insert-throw if needed.

---

## 7. Success Criteria for Resolution

1. **Retrieval integration test**
   - When RuVector is intended to be available in the test run, the test **runs** (no skip due to client null unless we explicitly want to skip when ruvector is unavailable).
   - `ingestMemoryUnit(...)` returns a non-null ID and the test passes (non-empty refs, content contains “OAuth2” or “authentication”).
   - If RuVector is not available, the test is skipped in a well-defined way (e.g. same condition as other integration tests: `ruvectorAvailable && sqliteAvailable`), not hidden by `getRuvectorClient() === null` at runtime.

2. **Harvest tests**
   - Continue to pass.
   - Optionally: no stderr “Failed to load embedding model” when running in an environment where the ONNX embedder is expected to load (or stderr is explicitly acceptable for “hash fallback in test” and documented).

3. **Embedding / ruvector-onnx-embeddings-wasm**
   - In Node/Vitest, either:
     - The real embedder loads without “module is not defined” (e.g. package fix, ESM entry, or Vitest config), or
     - Embedder is mocked in tests so integration tests don’t depend on the WASM loader, and the app path is fixed or documented for production.

---

## 8. Actionable Steps for Fixer Agent

1. **Confirm retrieval failure mode**
   - In `lib/memory/ingestion.ts`, in the `catch` that returns null after `rv.insert` (lines 63–65), add temporary logging (e.g. `console.warn('ingestMemoryUnit: insert failed', err)`) and run the retrieval integration test when the test is not skipped. This distinguishes “client null” vs “insert threw.”
   - Remove the logging once the root cause is fixed.

2. **If client is null in test**
   - Ensure the test environment can load `ruvector-core` (Vitest config, dependency handling, or optional dependency).
   - Or keep the integration test gated on a single “ruvector available” check (e.g. same as harvest: `ruvectorAvailable` from `__tests__/lib/ruvector-test-helpers`) and avoid relying on `getRuvectorClient() === null` at test run time for skip logic, so behavior is consistent and documented.

3. **If `rv.insert()` throws**
   - Inspect error message and stack (with the temporary logging above).
   - Check vector dimensions (384) and RuVector client config (dimensions, `storagePath`, permissions).
   - Align with `lib/ruvector/client.ts` and `lib/memory/embedding.ts` (fallback produces 384-dim vectors).

4. **Embedding “module is not defined”**
   - Prefer upstream: check if `ruvector-onnx-embeddings-wasm` has an ESM-safe build or a `.cjs` build and use that from the loader.
   - If not: consider mocking `lib/memory/embedding` (or the loader) in Vitest so integration tests don’t load `ruvector_onnx_embeddings_wasm.js` in the test runner; or use a Vitest/Node option to run that file as CJS if possible.
   - Do not rely on hash fallback as the long-term fix for running the real model in app or in integration tests that are meant to test semantic behavior.

5. **Tests**
   - Ensure retrieval integration test asserts expected behavior (non-null id, non-empty refs, content expectations) when RuVector is available, and is explicitly skipped when not (e.g. `describe.skipIf(!ruvectorAvailable || !sqliteAvailable)` or equivalent).
   - Optionally add a small unit test that, with a mocked client and mocked `embedText`, verifies that `ingestMemoryUnit` returns the generated ID when `rv.insert()` resolves (and returns null when client is null or insert rejects).

---

## 9. Tests Referenced

| Test file                    | Relevant tests                                                                 | Current result        |
|-----------------------------|---------------------------------------------------------------------------------|------------------------|
| `__tests__/lib/memory/retrieval.test.ts` | Integration: “retrieveForCard end-to-end: when client available, …”            | Skipped when client null |
| `__tests__/lib/memory/harvest.test.ts`   | Integration: “harvestBuildLearnings: ingests learnings, count > 0, vectors searchable” | Pass (stderr embedding error) |

---

## 10. Summary

- **Expected behavior:** Retrieval integration test ingests a unit and retrieves by semantic query; harvest ingests learnings with real or fallback embeddings; no “module is not defined” when using the real embedder.
- **Current behavior:** Retrieval integration test is skipped when `getRuvectorClient() === null`; when it was not skipped, `ingestMemoryUnit` returned null (cause: client null or `rv.insert()` throw). Harvest passes; embedding loader fails in ESM with “module is not defined” and fallback is used.
- **Data flow:** ingestion → getRuvectorClient (mocked in tests) → embedText (loader → WASM) → rv.insert → db writes.
- **Root causes:** (1) Retrieval: either `getRuvectorClient()` returning null in test env or `rv.insert()` throwing; (2) Embedding: CJS usage in `ruvector_onnx_embeddings_wasm.js` under an ESM package.
- **Sources:** `lib/memory/ingestion.ts` (46–47, 63–65), `lib/ruvector/client.ts` (72–88), `lib/memory/embedding.ts` (50–68), `node_modules/ruvector-onnx-embeddings-wasm/loader.js` (283), `node_modules/ruvector-onnx-embeddings-wasm/ruvector_onnx_embeddings_wasm.js` (3, 566, 631).
- **Tests:** `__tests__/lib/memory/retrieval.test.ts`, `__tests__/lib/memory/harvest.test.ts`.
