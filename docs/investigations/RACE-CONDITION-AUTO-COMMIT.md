# Race condition at auto-commit

## What’s happening

1. **Agent runs in a subprocess** (SDK spawns Claude Code with `cwd` = clone path). The agent writes files in that directory.
2. **When the subprocess exits**, the SDK’s `query()` promise resolves and we get control in the same Node process.
3. **We immediately call** `processWebhook(execution_completed)` → `performAutoCommit(worktreePath)` → `getStatusPorcelain(worktreePath)`.
4. **Sometimes** that first `git status` sees **no changes**: the files the agent wrote aren’t visible yet to our process (e.g. subprocess just exited, OS hasn’t flushed, or our `git` run is scheduled before the filesystem has synced).
5. We return `no_changes` and mark the build blocked. Later, the same directory **does** show the files (confirmed: files exist in the clone; path is correct).

So the bug is a **race**: we run `git status` too soon after the agent subprocess exits, and occasionally see an empty working tree.

## Evidence

- Files from the user’s screenshot are in the clone at `~/.dossier/repos/<projectId>/`.
- `assignment.worktree_path` is that same path.
- At 18:11:36 we logged execution_blocked "No changes to commit".
- In that clone **now**, `git status` shows changes (e.g. ` M src/components/Header.tsx`).
- No second directory involved; path is correct. So the only remaining explanation is **timing**.

## Fix

In **performAutoCommit**, when the first `getStatusPorcelain(worktreePath)` returns **zero lines**:

1. **Wait** a short interval (e.g. 500–1000 ms).
2. **Call** `getStatusPorcelain(worktreePath)` again.
3. If the second call has lines, use that result and continue (stage, commit).
4. If still zero lines, then return `no_changes` as today.

This removes the race: we give the filesystem a moment to make the agent’s writes visible before we conclude “no changes.”

## Optional

- Make the delay configurable (e.g. env `DOSSIER_AUTO_COMMIT_RETRY_DELAY_MS`).
- Log when we retry (“first status empty, retrying after N ms”) for diagnostics.
