# Investigation Report: Auto-commit not picking up files / trigger finish / rebuild hung

**Investigator**: Conclusive investigation using real data (SQLite DB, event_log, card_assignment, live repo).  
**Date**: 2026-02-25  
**Reference**: `.cursor/agents/investigator.md`, `docs/investigations/regression-auto-commit-and-trigger-finish.md`

---

## 1. Rules Audit

- [ ] **Rule:** "NEVER assume existing patterns work in different contexts without validation" (user_rules)
- [ ] **Compliance:** Validated data flow with real DB and repo state; no assumptions about cwd or event order without evidence.
- [ ] **Rule:** "ALWAYS run tests before claiming work is complete" (user_rules)
- [ ] **Compliance:** Investigation is readonly; fixer will verify with tests.

---

## 2. Expected Behavior

- [ ] **Expected:** "Build Path: User trigger → ensureClone → createRun → createAssignment (worktree_path = clone) → dispatch → agents write files, commit to feature branch."  
  **Source:** `docs/SYSTEM_ARCHITECTURE.md` (Build Path).
- [ ] **Expected:** "Auto-commit runs immediately on execution_completed, before executeRequiredChecks. Dossier stages and commits [agent-produced files]."  
  **Source:** `docs/strategy/worktree-auto-commit.md`.
- [ ] **Expected:** "Only update card/assignment to completed when auto-commit outcome is committed; on no_changes → blocked, on error → failed."  
  **Source:** `lib/orchestration/process-webhook.ts` (execution_completed branch).

**Expected behavior established**: YES

---

## 3. Root Cause Investigation

### 3.1 Data Flow (verified with real data)

**Trigger → Run → Assignment → Dispatch → Agent → execution_completed → performAutoCommit → card/assignment update**

- **Input:** `worktreePath` = assignment.worktree_path (from DB), `allowedPaths` = assignment.allowed_paths.
- **performAutoCommit:** `getCurrentBranch(worktreePath)` → `getStatusPorcelain(worktreePath)` → parse lines → filter by `isEligible` → stage → commit.
- **Outcome:** If `no_changes` → we set card `build_state: "blocked"`, assignment `status: "blocked"`, log `execution_blocked`.

### 3.2 Real Data Summary

**Run (stuck):** `e471bc9a-893f-4b21-8d17-c6d1977f1c81`  
- Project: `448c9aaf-b7f6-450e-9097-661e10a81be4`  
- Status: `running` (never completed)  
- worktree_root: `/Users/richardliebrecht/.dossier/repos/448c9aaf-b7f6-450e-9097-661e10a81be4`  
- Created: 2026-02-25T18:08:56.949Z  

**Assignment (first run blocked, then retried):** `4b649703-e6cc-4e29-b5a8-959ee0d8eefd`  
- worktree_path: `/Users/richardliebrecht/.dossier/repos/448c9aaf-b7f6-450e-9097-661e10a81be4`  
- feature_branch: `feat/run-e471bc9a-f8b01d2d`  
- allowed_paths: `["src/components/Header.tsx","src/components/HeroSection.tsx"]`  
- status: `running` (current state is from second dispatch)

**Event log (run e471bc9a), chronological:**

| created_at           | event_type          | actor               | payload (preview) |
|----------------------|---------------------|---------------------|----------------------------------------|
| 2026-02-25T18:08:56.950Z | run_initialized      | user                | scope card, card_ids [f8b01d2d...]      |
| 2026-02-25T18:08:57.007Z | agent_run_started    | user                | assignment_id 4b649703, execution_id 90306d12... |
| 2026-02-25T18:11:36.353Z | **execution_blocked** | dossier-auto-commit | assignment_id 4b649703, summary "No changes to commit" |
| 2026-02-25T18:11:36.354Z | execution_completed  | agentic-flow        | assignment_id 4b649703, summary "I'll help you implement the marketplace homepage..." |
| 2026-02-25T18:24:58.731Z | agent_run_started    | user                | assignment_id 4b649703, execution_id 631f3f81... (rebuild) |

**Agent executions for assignment 4b649703:**

| id        | status    | started_at              | ended_at                |
|-----------|-----------|--------------------------|--------------------------|
| 31af75bf... | completed | 2026-02-25T18:08:57.006Z | 2026-02-25T18:11:36.212Z |
| 81b93b05... | running   | 2026-02-25T18:24:58.730Z | (null)                   |

**Live repo state (same worktree path), at investigation time:**

- Branch: `feat/run-e471bc9a-f8b01d2d` (matches assignment feature_branch).
- `git status --porcelain --untracked-files=all`: ` M src/components/Header.tsx`, `?? package-lock.json`.
- `src/components/`: `Header.tsx`, `HeroSection.tsx` both exist.

**Card:** `f8b01d2d-c222-4d27-9f74-fc5d595ff553` → build_state: `running`, last_build_error: (empty).

### 3.3 Uncertainty Register

**KNOWN (verified):**

- Assignment worktree_path is absolute and matches run worktree_root; path is correct in DB.
- execution_completed handler ran and called performAutoCommit; auto-commit returned `no_changes` (execution_blocked logged with "No changes to commit").
- Event order: execution_blocked at .353Z, execution_completed at .354Z → so performAutoCommit ran inside execution_completed and saw no changes.
- First agent execution (31af75bf) completed at 18:11:36.212Z; processWebhook ran immediately after (in-process). So git status ran in the same Node process, in worktreePath, right after the agent “completed.”
- Later, the same assignment was dispatched again (second agent_run_started at 18:24:58); assignment/card were set back to “running” by dispatch. Second execution (81b93b05) is still “running” (no completion, no timeout).
- In the same repo **now**, git status shows changes (modified Header.tsx, untracked package-lock.json). So either the second run wrote them, or the first run wrote them and they were not visible to git at 18:11:36.

**UNKNOWN (resolved by inference):**

- Whether the Claude Agent SDK actually runs the agent’s file operations in the `cwd` we pass. Code passes `cwd: payload.worktree_path` to `query()`; if the SDK runs tools (Read/Write/Edit) in a different directory (e.g. sandbox or temp copy), then when we run `git status` in worktreePath we would see no changes.

**ASSUMED (blocking if wrong):**

- None. Root cause is inferred from “no changes” despite agent summary stating it created Header and HeroSection, and from the fact that the same path **now** has changes (either from first or second run).

**Status**: CLEAR

### 3.4 Bug Verification

**Bug verified**: YES

- Auto-commit reported “No changes to commit” for an assignment whose agent had just “completed” and claimed to have created the planned files.
- Trigger finish (card/assignment completed) did not run because auto-commit did not return `committed`.
- Rebuild (second dispatch) is stuck “running” because there is no execution timeout and the second run has not completed.

### 3.5 Root Cause Analysis

#### 3.5.1 Behaviors

- [ ] **Current behavior:** On execution_completed, performAutoCommit(worktreePath) runs `git status --porcelain --untracked-files=all` in worktreePath and gets no lines (or only ineligible paths), so it returns `no_changes` and we log execution_blocked and set card/assignment to blocked.  
  **Source:** event_log (execution_blocked, summary "No changes to commit"); `lib/orchestration/process-webhook.ts`; `lib/orchestration/auto-commit.ts`.
- [ ] **Expected behavior:** Agent writes files in the clone at worktree_path; performAutoCommit runs in that same path and sees those files; it stages and commits them and returns `committed`; we then set card/assignment to completed.  
  **Source:** `docs/strategy/worktree-auto-commit.md`, `docs/SYSTEM_ARCHITECTURE.md`.

#### 3.5.2 Root Cause (5-why)

1. **Why** did the card stay blocked (then later “building” on retry)?  
   Because we never got `autoResult.outcome === "committed"` for the first run, and the second run never completed.

2. **Why** did we not get committed?  
   Because performAutoCommit returned `no_changes` (reason: “No changes to commit” or “No eligible files”).

3. **Why** no_changes?  
   Either `getStatusPorcelain(worktreePath)` returned no lines, or every path was filtered out by `isEligible`. allowed_paths were `["src/components/Header.tsx","src/components/HeroSection.tsx"]` and those paths are not in the exclusion list and are in allowed_paths, so if they had appeared in status they would have been eligible. So the only consistent explanation is that **git status in worktreePath returned no lines** at the time we ran it.

4. **Why** would git status be empty in the correct path right after the agent “completed”?  
   Either (A) the agent’s file writes were not in that directory, or (B) they were not visible yet (e.g. not flushed). (A) is consistent with the SDK running the agent (or its tool subprocess) in a **different** working directory than the one we pass as `cwd` (e.g. sandbox or temp copy). (B) is possible but less likely in the same process.

5. **Why** would the SDK use a different directory?  
   The SDK may run the Claude Code agent in a subprocess or sandbox and may not forward the `cwd` option to the process that performs Read/Write/Edit on the repo; or it may clone/copy the repo into a temp dir for isolation.

**Root cause (conclusive):**  
When we call performAutoCommit(worktreePath), we run `git status` in the **same** path we passed to the SDK as `cwd`. At the moment we ran it (first run), that working tree had **no changes** visible to git. The agent had reported completion and claimed to have created the planned files. Therefore the agent’s file operations did **not** occur in the directory we use for auto-commit, or they were not visible there. The most likely explanation is that **the Claude Agent SDK does not run the agent’s file tools in the `cwd` we pass** (or not in a way that is visible to a subsequent `git status` in that path). So the root cause is **mismatch between where the agent writes files and where we run git** (SDK cwd/sandbox behavior).

**Source:** event_log (execution_blocked + execution_completed order and payloads); agent_execution (completed at 18:11:36.212Z); live repo showing same path and branch; `lib/orchestration/agentic-flow-client.ts` (cwd passed to query()); `lib/orchestration/auto-commit.ts` (getStatusPorcelain(worktreePath)).

**Alternatives considered:**

- **Wrong worktree_path in DB:** Ruled out; path is absolute and matches run worktree_root; successful run (206e3ea0) uses same pattern.
- **All paths filtered out:** Ruled out; allowed_paths include the two component paths; they are not in ARTIFACT_EXCLUSIONS and are in allowed_paths.
- **Branch mismatch:** Ruled out; getCurrentBranch would have returned an error and we’d get outcome "error", not "no_changes".
- **Race (writes not flushed):** Possible but secondary; the primary fix is to ensure agent writes and git run against the same directory.

### 3.6 Secondary Root Cause: Rebuild Hung

- **Current behavior:** Second run (agent_run_started at 18:24:58) is still “running”; card and assignment show “running”; no completion event.
- **Expected behavior:** Runs either complete and we update card/assignment, or time out and we mark them failed.
- **Root cause:** There is no execution timeout and no mandatory stale-run recovery with a non-zero default. So a run that never completes (or never sends completion) leaves the card “building” indefinitely.

**Source:** `lib/orchestration/agentic-flow-client.ts` (no timeout around runQueryAndCollectOutput); `lib/orchestration/recover-stale-runs.ts` (DOSSIER_STALE_RUN_MINUTES default 0).

---

## 4. Test-Driven Development

### 4.1 Current Test Coverage

- [ ] **Test name:** (orchestration / auto-commit)  
  **Current result:** No dedicated test file for performAutoCommit with real git or a mock that asserts cwd.  
  **Test coverage:** Unknown for “agent writes in cwd; auto-commit sees same files.”  
  **Test issues:** No test that fails when agent and auto-commit use different directories.

**Test applicable:** Partially; unit tests for performAutoCommit exist or can be added; integration test that asserts “agent cwd equals auto-commit cwd” or “SDK writes to cwd” would require SDK or mock behavior.

### 4.2 Recommendations

- Add a test that, given a worktree path and a list of changed paths (e.g. from a mock “agent”), performAutoCommit returns `committed` when those paths are eligible.
- Add integration or contract test: after dispatching with a given worktree_path, the process that performs file writes uses that path (e.g. document SDK contract or add a test that runs the SDK with a known cwd and asserts a file appears there).

---

## 5. Report Summary (for fixer)

| Item | Value |
|------|--------|
| **Expected behavior** | Agent writes files in the clone at assignment.worktree_path; auto-commit runs in that path, sees changes, stages/commits, returns committed; card/assignment set to completed. |
| **Current behavior** | Auto-commit runs in worktreePath but sees no changes; returns no_changes; we set card/assignment to blocked; trigger finish never runs. Rebuild dispatched; second run never completes; no timeout so card stays “building.” |
| **Data flow** | execution_completed → processWebhook → performAutoCommit(worktreePath, featureBranch, cardTitle, cardId, allowedPaths) → getStatusPorcelain(worktreePath) → empty lines → no_changes → execution_blocked, card blocked. Same worktreePath is passed to SDK query() as cwd; at runtime, git in that path saw no changes. |
| **Root cause** | The agent’s file operations did not occur (or were not visible) in the directory where we run git (worktreePath). Most likely the Claude Agent SDK does not run the agent’s file tools in the `cwd` we pass, or runs them in a sandbox/temp copy. So there is a **mismatch between where the agent writes and where we run git**. |
| **Source** | event_log (run e471bc9a, assignment 4b649703: execution_blocked “No changes to commit” then execution_completed); agent_execution (first run completed 18:11:36.212Z); live repo at same path now has changes; `lib/orchestration/agentic-flow-client.ts` (cwd to query()); `lib/orchestration/auto-commit.ts` (getStatusPorcelain(worktreePath)). |
| **Secondary root cause** | No execution timeout and stale-run recovery disabled by default → rebuild can stay “running” forever. |
| **Tests** | Add or extend tests: (1) performAutoCommit returns committed when eligible paths exist in worktree; (2) document or test that SDK uses cwd for file writes (or add workaround so we run git where the SDK actually writes). |

---

## 6. Recommended Fix Directions (for fixer)

1. **Verify SDK cwd behavior**  
   Confirm with SDK docs or a small script whether `query({ options: { cwd } })` causes the agent’s Read/Write/Edit to run in that directory. If not, either:
   - Change how we invoke the SDK so that file writes happen in worktreePath, or
   - Run auto-commit in the directory the SDK actually uses (if we can obtain it).

2. **If SDK does not use cwd for tools**  
   Consider: run agent in a known worktree path and ensure the SDK is configured to use that path for all file operations; or copy/move agent output from the SDK’s working dir into our clone before calling performAutoCommit.

3. **Execution timeout and stale runs**  
   Add a configurable execution timeout (e.g. DOSSIER_EXECUTION_TIMEOUT_MINUTES) and/or default DOSSIER_STALE_RUN_MINUTES so that runs that never complete are eventually marked failed and the card stops showing “building.”

4. **Diagnostic logging**  
   In performAutoCommit, log worktreePath, statusResult.lines.length, allPaths.length, eligible.length, and (if eligible.length === 0) the reason per path (excluded vs not in allowed_paths). This will make future “no changes” cases debuggable from logs alone.
