# Regression: Auto-commit not picking up files / trigger finish not firing

**Context:** Build triggered successfully; agent created the correct files locally. Auto-commit reported an error (could not find local files). Rebuild was started but has not completed; no code changes during rebuild (process hung). No files have been added to main. Regression since last night (was working on main).

---

## What we know

| Fact | Implication |
|------|-------------|
| Build triggered successfully | Run + assignments created; `worktree_path` and `allowed_paths` were set at trigger time. |
| Agent created correct files locally | Files exist on disk in the project clone at `worktree_path`. |
| Auto-commit "could not find" them | Either `getStatusPorcelain(worktreePath)` returned no lines, or all paths were filtered out by `isEligible` → `no_changes` or `error`. |
| Rebuild hasn’t completed | Second run’s agent is still running (or stuck); no execution timeout. |
| No files on main | First run never committed; second run hasn’t finished. |

---

## Data flow (for debugging)

1. **Trigger build**  
   `trigger-build.ts`: `ensureClone` → `clonePath`; for each card `getCardPlannedFiles` → `allowedPaths`; `createFeatureBranch(clonePath, featureBranch, baseBranch)`; `createAssignment(..., worktree_path: clonePath, allowed_paths: allowedPaths)`.

2. **Agent runs**  
   `dispatch` sends `worktree_path` and `allowed_paths` from the **same** assignment. Agent runs with `cwd: payload.worktree_path` (the clone). So files are created under that path.

3. **On execution_completed**  
   `process-webhook.ts`: load assignment by `assignment_id` from webhook payload → `worktreePath = assignment.worktree_path`, `allowedPaths = assignment.allowed_paths`.  
   If `worktreePath` is set → `performAutoCommit({ worktreePath, featureBranch, cardTitle, cardId, allowedPaths })`.

4. **Auto-commit**  
   `auto-commit.ts`:  
   - `getCurrentBranch(worktreePath)`  
   - `getStatusPorcelain(worktreePath)` → `status --porcelain --untracked-files=all` in that `cwd`  
   - `parsePorcelainLines(lines)` → paths  
   - `eligible = allPaths.filter(isEligible(_, allowedPaths))`  
   - If `eligible.length === 0` → return `no_changes` (“No changes to commit” or “No eligible files (N excluded by policy)”).  
   - Else stage each, commit.

5. **Trigger finish**  
   Only when `autoResult.outcome === "committed"` do we insert commit, log event, and later set card/assignment to completed. If outcome is `no_changes` or `error`, we set card to `blocked` or `failed` and never “finish” as success. So **trigger finish depends on auto-commit succeeding**.

---

## Why auto-commit might “not find” files

### A. Wrong or missing `worktree_path`

- If the assignment’s `worktree_path` were null, we’d skip auto-commit entirely (no “could not find” error from auto-commit).
- If it pointed at a different directory (e.g. Dossier app root instead of the clone), `git status` there would show no agent-created files.
- **Check:** Log in `process-webhook.ts` (before `performAutoCommit`): `worktreePath`, and that the directory exists and is a git repo. Log `assignment_id` so you’re sure it’s the assignment that was dispatched.

### B. `getStatusPorcelain` returns no lines

- We use `--untracked-files=all`, so untracked files should appear.
- **Check:** In `performAutoCommit`, after `getStatusPorcelain(worktreePath)`: log `worktreePath`, `statusResult.success`, and `statusResult.lines` (and `lines.length`). If `lines` is empty despite files on disk, the `cwd` is wrong or git is not run in the clone.

### C. All paths filtered out by eligibility (“No eligible files (N excluded by policy)”)

- Eligibility: `!isExcluded(path)` and (`isInRootAllowlist(path)` or `isInAllowedPaths(path, allowedPaths)`).
- Root allowlist: certain root-level config files + `__tests__/`, `docs/`.
- So: if the agent created only paths that are (1) not under `docs/` or `__tests__/`, (2) not in root allowlist, and (3) not in `allowed_paths`, they are all excluded.
- `allowed_paths` come from **planned files** at trigger time: `getCardPlannedFiles(db, cardId)` → `logical_file_name`. If the agent creates `src/components/Foo.tsx` but planned files only had `src/Foo.tsx`, that path is not in `allowed_paths` and not in the dir allowlists → excluded.
- **Check:** In `performAutoCommit`, log `allPaths` and `eligible` (and `allowedPaths`). If `allPaths.length > 0` but `eligible.length === 0`, the regression is path mismatch (planned vs actual) or an over-strict allowlist.

### D. Branch mismatch

- We require `getCurrentBranch(worktreePath) === featureBranch`. If the clone is on a different branch (e.g. after a rebuild that ran `createFeatureBranch` and left the clone on the new run’s branch), the **first** run’s webhook would still use the first run’s `feature_branch` and the clone might already be on the second run’s branch → branch mismatch error.
- **Check:** Log the branch check result and the current branch vs expected.

---

## Why “commit not detected / trigger finish” fails

- Trigger finish (card/assignment completed, commit on branch) only happens when `autoResult.outcome === "committed"`. If auto-commit returns `no_changes` or `error`, we never mark the run as successfully finished and never push to main (we don’t push in this flow; the idea is “commit is created locally,” and finish = we recorded it and updated the card). So the **root fix** is making auto-commit succeed (find and commit the files). There is no separate “detect commit” step that’s failing; the step that creates the commit is the one that’s failing.

---

## Why rebuild hangs

- The second run has no execution timeout. The agent runs in the same clone (possibly with uncommitted files from the first run on a new feature branch). If the agent does little or the SDK call hangs, the run never completes and the card stays “building.” Fix: execution timeout and/or stale-run recovery (see earlier discussion; you reverted the timeout change).

---

## Recommended diagnostic steps (no code from me)

1. **Confirm assignment and path**  
   In `process-webhook.ts` when handling `execution_completed`, log:  
   `assignment_id`, `worktreePath`, `fs.existsSync(worktreePath)`, and result of `runGit(worktreePath, ['rev-parse','--is-inside-work-tree'])` (or similar) so you know we’re in the right repo.

2. **Inspect what git sees**  
   In `performAutoCommit`, right after `getStatusPorcelain`:  
   log `statusResult.lines` and `statusResult.lines.length`. If length is 0 but you know files exist in that directory, the cwd is wrong.

3. **Inspect eligibility**  
   Log `allPaths`, `allowedPaths`, and `eligible`. If `allPaths` is non-empty but `eligible` is empty, log for one path why it failed (excluded vs not in allowlist vs not in allowedPaths).

4. **Compare to main**  
   Diff `lib/orchestration/auto-commit.ts`, `lib/orchestration/git-ops.ts`, and `lib/orchestration/trigger-build.ts` (and where `worktree_path` / `allowed_paths` are set and read) between your branch and main. Anything that changed how `worktree_path` is set, how `getStatusPorcelain` is called, or how `allowed_paths` / eligibility work could explain the regression.

---

## Fix directions (for you to implement)

- **If path is wrong:** Ensure the assignment used in the webhook is the one that was dispatched, and that `worktree_path` is the same absolute path as the clone (and that we’re not overwriting or losing it between trigger and webhook).
- **If git status is empty in the right path:** Ensure we run `git status` with `cwd: worktreePath` and that the process has no reason to change cwd (e.g. no chdir elsewhere). Confirm `--untracked-files=all` is still in use in `getStatusPorcelain`.
- **If all paths are excluded:** Widen eligibility: e.g. allow any path that isn’t excluded (not just allowlist + allowedPaths), or ensure planned files and/or allowlists include the paths the agent actually creates (e.g. normalize paths, or add a fallback like “if no eligible from planned, allow all non-excluded” for this flow). Document the choice.
- **If branch mismatch on rebuild:** When starting a new run we create a new feature branch in the same clone; the clone is then on the new run’s branch. The **first** run’s completion webhook still runs with the first run’s assignment (same clone path, first run’s feature branch). So we’d be running auto-commit expecting branch `feat/run-OLD-...` while the clone might already be on `feat/run-NEW-...` if the second run’s trigger already ran `createFeatureBranch`. So the first run’s webhook could see a branch mismatch. Mitigation: run auto-commit in a way that doesn’t depend on current branch (e.g. checkout the assignment’s feature branch in the clone, run status/add/commit, then leave branch as-is or restore). Or ensure webhooks are processed in order so the first run’s completion is handled before the second run’s trigger changes the branch.

---

## Summary

| Issue | Likely cause | What to do |
|-------|---------------|------------|
| Auto-commit “could not find” files | Wrong cwd, or all paths excluded by eligibility, or branch mismatch | Log path, git status lines, allPaths/eligible/allowedPaths; compare to main; fix path or eligibility or branch handling. |
| Trigger finish never happens | Auto-commit never returns `committed` | Fix auto-commit so it finds and commits the files; then trigger finish will run. |
| Rebuild hung | No execution timeout | Reintroduce a timeout (or stale-run recovery) so runs don’t stay “building” forever. |
