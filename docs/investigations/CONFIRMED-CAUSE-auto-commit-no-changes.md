# Confirmed cause: auto-commit ran but saw no changes

**Status:** Single root cause established (path ruled out; race confirmed).  
**Date:** 2026-02-25

---

## Confirmed root cause

**We run `git status` immediately after the agent process exits. The agent’s file writes are not yet visible to our process when we run it, so we see no changes.**

So the cause is a **race condition**: no delay between “agent completed” and “run auto-commit,” so the first (and only) `git status` can see an empty working tree even though the agent wrote files in the same directory.

---

## Why path is ruled out

The same path is used for both the agent and auto-commit by construction:

| Step | Source | Value |
|------|--------|--------|
| Set once | `trigger-build.ts`: `worktreePath = clonePath` (absolute from `getClonePath(projectId)`) | Stored as `assignment.worktree_path` |
| Agent cwd | `dispatch.ts`: `payload.worktree_path = worktreePath` from same assignment → `agentic-flow-client.ts`: `cwd: payload.worktree_path` | Same DB value |
| Auto-commit | `process-webhook.ts`: `worktreePath = assignment.worktree_path` (same assignment by `assignment_id`) → `performAutoCommit({ worktreePath, ... })` | Same DB value |

There is no second source, no resolution difference, and no code path that passes a different directory to the SDK than to `performAutoCommit`. So we do **not** run git in a different directory than the agent; path divergence is ruled out.

---

## Why race is confirmed

Control flow in `lib/orchestration/agentic-flow-client.ts`:

1. `await runQueryAndCollectOutput(..., { cwd: payload.worktree_path })` — SDK runs the agent in that `cwd`; promise resolves when the agent (subprocess) has finished.
2. Immediately after (no `setTimeout`, no `await` of a delay), we call `await processWebhook(db, { event_type: "execution_completed", ... })`.
3. `processWebhook` loads the assignment, reads `assignment.worktree_path`, and calls `performAutoCommit(worktreePath, ...)`.
4. `performAutoCommit` calls `getStatusPorcelain(worktreePath)` → `runGit(cwd, ["status", "--porcelain", ...])` in that same path.

So **we run `git status` in the same directory, in the same process, in the same event-loop turn (or the next) after the SDK promise resolves.** The only way that directory can appear empty to `git status` even though the agent wrote files there is **timing**: the subprocess has exited, but the filesystem has not yet made those writes visible to the process that runs git (e.g. OS buffer flush, or a child of the agent still writing). So the root cause is a **race between subprocess exit and filesystem visibility**.

---

## Fix (for fixer)

When the first `getStatusPorcelain(worktreePath)` returns **zero lines**:

1. Wait a short interval (e.g. 500–1000 ms).
2. Call `getStatusPorcelain(worktreePath)` again.
3. If the second call has lines, use that result (stage, commit).
4. If still zero lines, then return `no_changes`.

See `docs/investigations/RACE-CONDITION-AUTO-COMMIT.md` for the same recommendation. Optional: make the delay configurable (`DOSSIER_AUTO_COMMIT_RETRY_DELAY_MS`) and log when we retry.

### Design: one retry, not “run until successful”

- **We use one delay + one retry only.** We do **not** loop until we see changes.
- **Why:** The race is “writes not visible yet” — typically a sub-second FS/sync delay. One short wait (500–1000 ms) is enough to resolve it in practice. If after that we still see zero lines, either (a) the agent really produced no changes, or (b) something else is wrong (path, permissions). Retrying many times doesn’t fix (a) or (b) and would delay reporting `no_changes` by seconds or more.
- **Run-until-success** would require a max attempts or max duration to avoid spinning forever when the agent wrote nothing; it adds complexity and makes genuine “no changes” slow. So: **delay once, retry once, then decide.**

---

## References

- `lib/orchestration/agentic-flow-client.ts` (runExecution: await runQueryAndCollectOutput → await processWebhook, no delay)
- `lib/orchestration/process-webhook.ts` (worktreePath from assignment, performAutoCommit(worktreePath))
- `lib/orchestration/trigger-build.ts` (worktreePath = clonePath → createAssignment)
- `lib/orchestration/dispatch.ts` (payload.worktree_path from assignment)
- `docs/investigations/SDK-PATH-VERIFICATION.md` (SDK uses cwd for file operations)
- `docs/investigations/RACE-CONDITION-AUTO-COMMIT.md` (retry-after-delay fix)
