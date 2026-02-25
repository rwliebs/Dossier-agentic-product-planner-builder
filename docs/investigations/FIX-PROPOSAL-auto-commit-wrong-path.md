# Fix proposal: Auto-commit running in wrong path

**Per:** `.cursor/agents/fixer.md`  
**Reference:** `docs/investigations/INVESTIGATION-REPORT-auto-commit-regression.md`, `docs/investigations/SDK-PATH-VERIFICATION.md`

---

## 1. Verify investigation report

| Item | Quote / value | Verdict |
|------|----------------|--------|
| **Expected behavior** | Agent writes files in the clone at assignment.worktree_path; auto-commit runs in that path, sees changes, stages/commits, returns committed; card/assignment set to completed. | **ACCEPT** |
| **Current behavior** | Auto-commit runs in worktreePath but sees no changes; returns no_changes; we set card/assignment to blocked; trigger finish never runs. Rebuild can stay “building.” | **ACCEPT** |
| **Data flow** | execution_completed → processWebhook → performAutoCommit(worktreePath, …) → getStatusPorcelain(worktreePath) → empty lines → no_changes → execution_blocked. | **ACCEPT** |
| **Root cause** | User confirmed files were created locally; we ran git in a **different directory** than where those files are. worktreePath at webhook time must be wrong or not the same path the agent used. | **ACCEPT** |
| **Source** | event_log, agent_execution, `lib/orchestration/agentic-flow-client.ts`, `lib/orchestration/auto-commit.ts`, `lib/orchestration/process-webhook.ts`. | **ACCEPT** |
| **Tests** | Add/extend: performAutoCommit when eligible paths exist; diagnostics. | **ACCEPT** |

---

## 2. Uncertainty register

**KNOWN**

- Run and assignment are both set with the same `clonePath` at trigger time (`trigger-build.ts`: run.worktree_root = clonePath, assignment.worktree_path = clonePath).
- Dispatch uses `assignment.worktree_path` for the SDK cwd; processWebhook uses `assignment.worktree_path` for performAutoCommit. So in code they share the same source.
- User confirmed files exist locally in the directory where the agent ran; we got “No changes” so git was run somewhere else or path was wrong at runtime.
- execute-checks already uses `run.worktree_root` as the canonical worktree path when available.

**UNKNOWN**

- Why assignment.worktree_path would differ from the actual agent cwd at webhook time (DB value, parsing, or a different assignment/run in edge cases). Using the run’s worktree_root for auto-commit removes reliance on the assignment’s copy of the path.

**ASSUMED**

- None.

**Status:** CLEAR — we can fix by making the path used for auto-commit canonical and adding diagnostics.

---

## 3. Proposed fix

### 3.1 Use run’s worktree as canonical path for auto-commit (primary)

**Goal:** Ensure we run `git status` in the same directory the run (and agent) use: the run’s clone.

**Change:** In `lib/orchestration/process-webhook.ts`, in the `execution_completed` branch, when deciding the path for performAutoCommit:

1. Prefer **run.worktree_root** when present (run is the source of truth for “where is the clone for this run”).
2. Fall back to **assignment.worktree_path** when run.worktree_root is null (e.g. legacy runs).
3. **Resolve to absolute** with `path.resolve(worktreePath)` so we never pass a relative path to git (avoids cwd-dependent resolution).

**Code (process-webhook.ts)**

- Add: `import * as path from "node:path";` at top if not present.
- Replace the block that gets worktreePath and calls performAutoCommit with:

```ts
const runWorktreeRoot = (run as { worktree_root?: string | null }).worktree_root;
const assignmentWorktree = (assignment as { worktree_path?: string | null }).worktree_path;
const rawPath = runWorktreeRoot ?? assignmentWorktree;
const worktreePath = rawPath ? path.resolve(rawPath) : null;
const featureBranch = (assignment as { feature_branch: string }).feature_branch;
const allowedPaths = (assignment as { allowed_paths: string[] }).allowed_paths ?? [];

let autoCommitOk = true;
if (worktreePath) {
  // ... rest unchanged: get card, performAutoCommit({ worktreePath, ... }), handle outcome
}
```

**Rationale:** run.worktree_root is set once at trigger and never updated; it’s the clone path for that run. Using it for auto-commit guarantees we run git in the same clone the agent used. Resolving to absolute avoids any relative-path or resolution bugs.

---

### 3.2 Diagnostic logging in performAutoCommit

**Goal:** Make “no changes” debuggable: see which path we used and what git saw.

**Change:** In `lib/orchestration/auto-commit.ts`, after `getStatusPorcelain` and after computing `eligible`:

- Log once (e.g. `console.warn` or a small logger) with:
  - `worktreePath`
  - `statusResult.lines.length` (and optionally first few lines if needed)
  - `allPaths.length`, `eligible.length`
  - If `eligible.length === 0` and `allPaths.length > 0`, log that we had changes but none eligible (no need to log every path in production; optional verbose mode).

**Rationale:** Next time we get “No changes to commit” we can see whether git saw no lines (wrong path or empty dir) or only ineligible paths (policy issue).

---

### 3.3 Optional: retry once on empty status

**Goal:** Rule out FS sync / timing (e.g. completion handler runs before all writes are visible).

**Change:** In `performAutoCommit`, if `statusResult.lines.length === 0` and we’re about to return `no_changes`, wait 500 ms and call `getStatusPorcelain(worktreePath)` once more; if the second call has lines, use that and continue. Otherwise return no_changes as today.

**Rationale:** Low cost; only runs when the first status is empty. Can be omitted in the first iteration and added later if needed.

---

### 3.4 Secondary: execution timeout / stale-run recovery

**Goal:** Avoid cards stuck in “building” when a run never completes.

**Change:** As in investigation report §6:

- Add configurable execution timeout (e.g. `DOSSIER_EXECUTION_TIMEOUT_MINUTES`, default 20) in `lib/orchestration/agentic-flow-client.ts`: when the timeout fires, abort and send execution_failed so the card is updated.
- And/or default `DOSSIER_STALE_RUN_MINUTES` to 20 in `lib/orchestration/recover-stale-runs.ts` so map load can mark stale runs failed.

**Rationale:** Independent of the path bug; improves robustness.

---

## 4. Implementation order

1. **3.1** — Use run.worktree_root + path.resolve in process-webhook (primary fix).
2. **3.2** — Add diagnostics in performAutoCommit.
3. Run existing tests (`pnpm test`, `__tests__/orchestration/auto-commit.test.ts`, `__tests__/orchestration/execution-integration.test.ts`); add or adjust a test that asserts auto-commit uses the path from the run when available.
4. **3.4** — Execution timeout and/or stale-run default (optional in same PR).
5. **3.3** — Retry on empty status (optional, can be a follow-up).

---

## 5. Tests

- **Existing:** `__tests__/orchestration/auto-commit.test.ts` (performAutoCommit with real git in tmp); `__tests__/orchestration/execution-integration.test.ts` (execution_completed + auto-commit). Keep these passing.
- **New or extend:** In execution-integration (or a dedicated test), assert that when processing execution_completed, the path passed to performAutoCommit is the run’s worktree_root when present (e.g. mock run with worktree_root set and assignment with a different worktree_path; assert performAutoCommit was called with the run’s path). Alternatively, unit-test a small helper “getAutoCommitWorktreePath(run, assignment)” that returns resolved run.worktree_root ?? assignment.worktree_path.

---

## 6. Rollback

- Revert the process-webhook change (restore assignment-only worktreePath) and the performAutoCommit logging if needed. No schema or API changes.

---

## 7. Summary

| What | Where | Why |
|------|--------|-----|
| Use run.worktree_root + path.resolve for auto-commit path | process-webhook.ts (execution_completed) | Single source of truth for clone path; same path as run/agent; avoid relative-path bugs. |
| Diagnostic logging | auto-commit.ts | Debug future “no changes” (path vs policy). |
| Optional retry on empty status | auto-commit.ts | Mitigate timing/FS sync. |
| Execution timeout / stale-run default | agentic-flow-client.ts, recover-stale-runs.ts | Prevent cards stuck “building.” |

This proposal implements the fixer flow: verify report → implement primary fix (canonical path + diagnostics) → test → optional secondary fixes.
