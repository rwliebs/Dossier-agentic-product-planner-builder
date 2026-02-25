# Test Failures Fix Plan (No Quick Fixes)

This document outlines the **proper** way to fix each failing test. Each section requires a product or architectural decision before implementation.

## Investigation summary (items 4 & 5)

| Item | Is the system failing? | Root cause |
|------|-------------------------|------------|
| **4. Memory retrieval timeout** | **No.** Logic is correct. | Test is slow integration (lazy load of embedding model + 2× embed + RuVector + DB). Default 5s timeout is too low when the model loads cold; test can pass when another test has already warmed the model. |
| **5. 0 build-ready cards** | **No.** API is behaving as designed. | E2E flow never finalizes the **project**. Card finalize requires `project.finalized_at` to be set; that is only set by `POST .../chat/stream` with `mode: "finalize"`. The test never calls that, so every card finalize returns 400 and no card is added to build-ready. |

---

## 1. Mock task examples (12 failures) — Phase 1 & Phase 3 in task description

**Failure:** Tests expect `taskDescription` to include "Phase 1: PROCESS CHECK" and "Phase 3: COMPLETION VERIFICATION". The implementation in `lib/orchestration/build-task.ts` has these phases **intentionally commented out** (see comments: "TEMPORARY: skip Phase 1/3 to see if build succeeds faster").

**Root cause:** Tests encode the original, full process-check design; the code was changed for a speed experiment. Tests were not updated to reflect the product decision.

**Proper fix (choose one path):**

- **Option A — Restore full process:** Product decision: we want Phase 1 and Phase 3 in the agent prompt. Then:
  1. Re-enable `PROCESS_CHECK_SCRIPT` and `COMPLETION_VERIFICATION_SCRIPT` in `build-task.ts`.
  2. Remove the "TEMPORARY" comments and document the decision (e.g. in strategy or ADR).
  3. No test changes needed.

- **Option B — Keep streamlined prompt:** Product decision: we keep the faster, Phase-2-only prompt. Then:
  1. Update tests in `__tests__/examples/mock-task-examples.test.ts` to assert the **current** contract: task description includes Phase 2 (implementation), planned files, acceptance criteria, etc., and does **not** require Phase 1 or Phase 3 text.
  2. Optionally add a short note in `lib/orchestration/build-task.ts` or strategy doc that the three-phase prompt is intentionally reduced to implementation-only for now.

**Do not:** Re-enable Phase 1/3 only to make tests pass without a product decision.

---

## 2. Trigger build — "rejects when card has no approved planned files" (1 failure)

**Failure:** Test expects `result.error === "Card(s) must have approved planned files"` when the card has no approved planned files. Actual behavior: build proceeds (createRun, createAssignment, dispatch), and failure happens later with a generic "Build dispatch failed".

**Root cause:** There is **no validation gate** in `trigger-build.ts` that rejects the request when cards have zero approved planned files. The strategy docs (e.g. `finalization-phase-strategy.md`, `user-stories.md`) state that build requires approved planned files; the code does not enforce this before starting the run.

**Proper fix:**

1. **Confirm product rule:** From existing docs, the rule is: build cannot trigger without approved planned files (and finalized_at). Confirm with product/strategy that this is still the rule.
2. **Implement the gate in the right place:** In `lib/orchestration/trigger-build.ts`, after the "cards finalized" check and **before** `ensureClone` / `createRun`:
   - For each card in scope, load planned files and count those with `status === 'approved'`.
   - If any card has zero approved planned files, return a structured error with `error: "Card(s) must have approved planned files"` and the existing `validationErrors` text expected by the test.
3. **Use existing query:** `getCardPlannedFiles` returns all rows; filter by `status === 'approved'` in the trigger logic (or introduce a query that returns only approved, if that fits the rest of the codebase).
4. **Do not:** Rely on a later failure from dispatch/assignment to produce this message; the contract is "reject at trigger time with a clear validation error".

---

## 3. Memory store — "rejected items are excluded from results" (1 failure)

**Failure:** Test inserts a memory unit with `status: 'rejected'` and expects `store.search(...)` **not** to return that unit’s ID. The implementation returns all in-scope units regardless of status.

**Root cause:** The `MemoryStore` interface comment says "Never rejected" (i.e. rejected items must not appear in search results), but the real store in `lib/memory/store.ts` does not filter by `memory_unit.status`.

**Proper fix:**

1. **Confirm retrieval policy:** Decide and document which statuses are visible:
   - Only `approved`?
   - `approved` and `draft`, but never `rejected`?
   - Document in strategy or memory-plane doc.
2. **Implement in one place:** In `lib/memory/store.ts`, in the real store’s `search` implementation, after loading units with `getMemoryUnitsByIds`, filter out units whose `status` is not allowed (at minimum exclude `rejected` to satisfy "Never rejected").
3. **Consistency:** If other code paths (e.g. ingestion, harvest) depend on status, ensure they align with this policy.
4. **Do not:** Add a one-off filter only for this test; enforce the policy in the store so all callers get consistent behavior.

---

## 4. Memory retrieval — "retrieveForCard end-to-end" timeout (1 failure)

**Failure:** Test times out in 5000 ms. It uses real embedding and RuVector (integration-style).

**Investigation (why it times out; is the system failing?):**

- **System is not failing.** The test does real work: `ingestMemoryUnit()` calls `embedText()` (one inference), then `retrieveForCard()` → `store.search()` calls `embedText()` again (second inference). Both use the real embedder from `lib/memory/embedding.ts` (ruvector-onnx-embeddings-wasm, model `all-MiniLM-L6-v2`).
- **Model load is lazy and slow.** The embedder is loaded on first use via a singleton (`loadEmbedder()`). The first call in the process (or in that worker) triggers download from Huggingface (e.g. `model.onnx`, `tokenizer.json`) and WASM init. Test output shows "Loading model: all-MiniLM-L6-v2 (23MB)" and "Downloading: https://huggingface.co/...". That alone can exceed 5 seconds; adding two inferences and RuVector insert/search makes the test often exceed Vitest’s default 5000 ms timeout.
- **Flakiness:** If another test (e.g. `embedding.test.ts`, `store.test.ts`, `harvest.test.ts`) runs first and warms the model, this test may pass; if this test runs early or in isolation, it times out. So the behaviour is timing-dependent, not a logic bug.

**Why it looked like "installing every time":** The upstream loader (`ruvector-onnx-embeddings-wasm/loader.js`) only uses the **browser Cache API** (`caches.open`, `cache.match`, `cache.put`). In Node (e.g. Vitest) `caches` is undefined, so the loader never caches and re-downloads from Huggingface on every run. That’s why the model appeared to re-install every time.

**Mitigation (implemented):** In Node, we now use a **file-based cache** in `lib/memory/embedding.ts`: first run downloads and writes to `.cache/ruvector-models/` (or `RUVECTOR_MODEL_CACHE`); later runs read from disk. So the model is downloaded once per environment, not every test run.

**Root cause:** Test is a slow integration test (model load + 2× embed + vector insert + vector search + DB) with no explicit timeout; default 5s is too low for cold model load. With the file cache, cold load happens once; subsequent runs are faster.

**Proper fix (choose one):**

- **Option A — Treat as slow integration:** Move the test to a "slow" or "integration" suite that has a higher default timeout (e.g. 30s), and document that it requires local RuVector + embedding. Set the timeout in the suite config or in the test with a comment referring to this plan.
- **Option B — Make it fast:** Refactor so that embedding and RuVector are mocked in this test, and only the retrieval **logic** (filtering, ordering, assembly of content) is under test. Keep a separate, clearly named integration test that runs with real RuVector and a long timeout.
- **Do not:** Only increase the timeout in this single test without deciding whether it should be fast (mocked) or explicitly slow (suite/config + docs).

---

## 5. E2E project-to-cards-flow — "≥2 cards build-ready" (1 failure)

**Failure:** After running the full flow (create project → scaffold → populate → for some cards: add planned file, approve, add requirement, finalize), the assertion expects at least 2 cards to be "build-ready" (approved planned files + finalized). Actual: 0 build-ready.

**Investigation (why 0 build-ready):**

- **Card finalize requires the project to be finalized first.** In `app/api/projects/[projectId]/cards/[cardId]/finalize/route.ts` (lines 151–156), the handler checks:
  - `if (!projectFinalizedAt) return validationError("Project must be finalized before cards can be finalized");`
- **Project is finalized only when** `POST /api/projects/:id/chat/stream` is called with `mode: "finalize"`. That path (in `chat/stream/route.ts`) runs `runFinalizeMultiStep`, then sets `db.updateProject(projectId, { finalized_at: now })` (line 129). There is no other API that sets `project.finalized_at`.
- **The E2E flow never finalizes the project.** `runFlow()` in `project-to-cards-flow.test.ts` does: create project → scaffold (mode `scaffold`) → populate (mode `populate` for two workflows) → then loops over cards and does planned-files POST, PATCH approve, requirements POST, finalize POST. It never calls `chat/stream` with `mode: "finalize"`. So `project.finalized_at` remains null.
- **Effect:** Every `POST .../cards/:cardId/finalize` returns 400 with "Project must be finalized before cards can be finalized". The test does `if (!finalizeRes.ok) continue`, so no card is ever added to `cardBuildReady`, and the assertion fails with 0 build-ready.

**Root cause:** The E2E flow is missing the project-level finalize step (one `POST .../chat/stream` with `mode: "finalize"` and consume SSE) before attempting to finalize individual cards.

**Proper fix:**

1. **Add the missing project finalize step.** After populate and before the loop that finalizes cards, call `POST ${BASE_URL}/api/projects/${projectId}/chat/stream` with body `{ message: "Finalize project", mode: "finalize" }`, and consume the SSE stream (e.g. using the existing `consumeSSE` helper from `helpers.ts`). That sets `project.finalized_at`, so subsequent card finalize requests will pass the project check.
2. **Keep the rest of the flow.** The existing sequence per card (create planned file → PATCH approve → add requirement → POST finalize) is correct; the only missing piece is project finalize once before that loop.
3. **Do not:** Lower the assertion (e.g. require 0 build-ready) or remove the project-finalize requirement from the API without a product decision.

---

## Summary

| Area              | Decision / action required before code change |
|-------------------|-----------------------------------------------|
| Mock task examples| Product: keep 3-phase prompt or keep Phase-2-only; then align code or tests. |
| Trigger build     | Confirm "approved planned files required" rule; add validation gate before run creation. |
| Memory store      | Define retrieval policy (rejected excluded / status filter); implement in store. |
| Retrieval timeout | Decide: slow integration (config + docs) or fast unit test (mocks); then implement. |
| E2E build-ready   | Investigate which step fails and why; fix API, test, or environment accordingly. |

No quick fixes: each item needs a clear decision or root-cause fix, then implementation.
