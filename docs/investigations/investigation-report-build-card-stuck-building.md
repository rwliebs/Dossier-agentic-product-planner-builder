# Investigation: Build card stuck in "building" (confirm dose taken – pill tracker)

**Date:** 2026-03-05  
**Card:** 42495fc2-2a29-45c1-a0f7-7622820d48b7 (confirm dose taken)  
**Project:** a058bdb3-f369-4bca-9bac-8123749e85d9 (pill tracker)

---

## Expected behavior

When the build agent finishes and (when applicable) auto-commit succeeds, the card’s `build_state` is set to `completed` and the UI shows "Merge feature" instead of "Building…".

---

## Current behavior

- Card stays in **building** (DB: `build_state = 'running'`, `last_built_at` NULL).
- Run and assignment are still **running**; no `execution_completed` / `execution_failed` / `execution_blocked` event for this run in `event_log`.
- Agent execution row exists with **status = running**, **ended_at** NULL.
- Worktree has a commit `c18a1f9 feat: implement confirm dose taken functionality` and untracked files (`lib/`, `src/components/MedicationList*.tsx`, etc.), so the agent did run and produce work.

---

## Root cause (from logs and DB)

**The completion path never ran for this build.**

1. **Build was started:** `agent_run_started` at 2026-03-05T19:57:20.870Z for assignment `80dbb02b-08ab-43a7-a34d-de0a022207d3`.
2. **No completion event:** There is no later `execution_completed`, `execution_failed`, or `execution_blocked` for this project/run in `event_log` after that time.
3. **Run/assignment/agent_execution still "running":**  
   `orchestration_run.status = running`, `card_assignment.status = running`, `agent_execution.status = running`, all with no `ended_at`.
4. **Card never updated:** `processWebhook(execution_completed)` (or the `execution_failed` fallback) was never called for this assignment, so the card was never set to `completed` or `failed`.

So the **agent run never completed from the app’s point of view**. Either:

- **A)** The SDK’s `runQueryAndCollectOutput` never resolved (agent subprocess still running or hung, or SDK never signaled completion).
- **B)** The subprocess exited (or crashed) and the completion/failure was never propagated to our `runExecution()`.
- **C)** `runExecution()` threw after the agent finished but before/during `processWebhook` (e.g. in the 2s pre-auto-commit delay, or in `getDb()` / `processWebhook`), and the `.catch()` either didn’t run or failed to update the card.

The dev server terminal only shows HTTP request logs; no `[auto-commit]` or "Post-execution webhook processing failed" messages, which is consistent with `processWebhook` never being reached for this run.

---

## Why build cards don’t consistently convert to completed

In general, the card only moves to **completed** when:

1. The build is triggered and dispatch returns success.
2. The agentic-flow client runs the agent (`runQueryAndCollectOutput`).
3. When the agent finishes, the client calls `processWebhook(db, { event_type: "execution_completed", ... })`.
4. If there is a `worktree_path`, `performAutoCommit` runs; only if the outcome is `committed` (or there is no worktree) do we set `build_state: "completed"`. Otherwise we set `blocked` (no_changes) or `failed` (auto-commit error).

So inconsistency can come from:

- **Completion never reported** (this case): run/assignment/agent_execution stay "running", card stays "building".
- **Auto-commit race:** first `git status` empty → `no_changes` → card set to **blocked** (see `CONFIRMED-CAUSE-auto-commit-no-changes.md`; retry-after-delay is in place but may not always be enough).
- **Auto-commit failure:** staging/commit error → card set to **failed** even though files exist.
- **allowed_paths:** all changed files filtered out → `no_changes` → **blocked**.

---

## Recommendations

### Immediate (this run)

1. **Recover the stuck run** so the card is no longer "building" and a new build can be started:
   - Call the map API (which runs `recoverStaleRuns`) after the run has been "running" longer than `DOSSIER_STALE_RUN_MINUTES` (default 15), or
   - Run `scripts/unstick-running-build.ts` (or equivalent) to mark the run/assignment as failed.
2. **Inspect server logs** (stdout/stderr of the Next.js process) for uncaught exceptions or "Post-execution webhook processing failed" around the time the agent would have finished.

### Short term

1. **Improve visibility:** Ensure `console.warn` / `console.error` from `auto-commit.ts` and `process-webhook.ts` (and the agentic-flow-client webhook fallback) are visible in the dev server output, or add a small logging layer that writes to a file or to `event_log` so you can see when execution_completed is processed and what auto-commit did.
2. **Optional: mark card failed on webhook throw:** In `agentic-flow-client.ts`, when the main `processWebhook(execution_completed)` throws, the fallback sends `execution_failed`. If that also throws, the card can stay "running". Consider a final fallback that at least sets the card to `failed` with a generic error (e.g. "Webhook processing failed") so the UI doesn’t stay on "building" forever.

### Medium term

1. **Stale run recovery:** Ensure `recoverStaleRuns` is called regularly (e.g. on map load is already in place) and that `DOSSIER_STALE_RUN_MINUTES` is set so runs that never receive a completion event are eventually marked failed and the card updated.
2. **Revisit auto-commit retry:** If "no_changes" still happens despite the 2s delay + single retry, consider a second retry or a slightly longer delay (e.g. `DOSSIER_AUTO_COMMIT_RETRY_DELAY_MS` / `DOSSIER_PRE_AUTOCOMMIT_DELAY_MS`).

---

## Data flow (for reference)

- **Build trigger:** `POST /api/projects/:projectId/orchestration/build` → `triggerBuild` → `dispatchAssignment` → `client.dispatch(payload)`.
- **Client:** `dispatch()` starts `runExecution()` without awaiting it, returns `{ success: true, execution_id }` (202).
- **When agent finishes:** `runExecution()` calls `processWebhook(execution_completed)` (after optional 2s delay) → `performAutoCommit` when `worktree_path` is set → on success: `updateCard(..., build_state: 'completed')`.
- **UI:** Polls map; card shows "Building…" when `build_state` is `queued` or `running`, or when `buildingCardId === card.id`; shows "Merge feature" when `build_state === 'completed'`.

---

## Queries used

```sql
-- Card state
SELECT id, build_state, last_build_error, last_built_at FROM card WHERE id = '42495fc2-2a29-45c1-a0f7-7622820d48b7';

-- Recent events for project
SELECT event_type, actor, created_at, substr(payload,1,150) FROM event_log WHERE project_id = 'a058bdb3-f369-4bca-9bac-8123749e85d9' ORDER BY created_at DESC LIMIT 25;

-- Run and assignment
SELECT id, status, scope, card_id, started_at, ended_at FROM orchestration_run WHERE project_id = '...' ORDER BY created_at DESC LIMIT 5;
SELECT ca.id, ca.card_id, ca.status, ca.worktree_path FROM card_assignment ca JOIN orchestration_run r ON r.id = ca.run_id WHERE r.project_id = '...' ORDER BY r.created_at DESC LIMIT 5;

-- Agent execution
SELECT id, assignment_id, status, started_at, ended_at FROM agent_execution WHERE assignment_id = '80dbb02b-08ab-43a7-a34d-de0a022207d3';
```
