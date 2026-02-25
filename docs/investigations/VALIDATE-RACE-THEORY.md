# Validate or disprove: race at auto-commit

## Theory (user)

There is a **race** at the auto-commit point: we run `git status` as soon as the SDK’s `query()` async iterator completes, but the agent subprocess’s file writes may not yet be visible to our process, so we sometimes see “no changes” even though the files exist in the same directory.

## What we know

- **Path is correct:** The files from the screenshot live in the clone at `~/.dossier/repos/<projectId>/`. The assignment’s `worktree_path` is that same path. We run `git status` there.
- **Timing:** At 18:11:36 we logged execution_blocked “No changes to commit”. Later, `git status` in that same path shows changes. So either (a) files weren’t visible at 18:11:36 (race), or (b) something else produced the files later (e.g. second run). The second run started at 18:24:58, so the files we see now could be from the first run (and we missed them) or from the second.
- **Flow:** `runQueryAndCollectOutput` does `for await (const msg of result)` then returns. As soon as that loop exits, we call `processWebhook(execution_completed)` → `performAutoCommit` → `getStatusPorcelain`. No delay. The SDK’s iterator completes when the Claude Code subprocess signals “done” (or exits).

## How to validate the race

1. **Instrument once:** In `performAutoCommit`, log (e.g. `console.warn` or structured logger):
   - `worktreePath`
   - `statusResult.lines.length` (and optionally `statusResult.lines.length` again after a 1s delay in a **separate** diagnostic path that doesn’t change behavior: e.g. if lines.length === 0, wait 1s, run status again, log the second line count). That way we see “first status 0, second status N” when it happens.
2. **Run builds:** Trigger several builds that produce files. If we ever see logs like “first status 0, second status > 0”, that **validates** the race: the files became visible shortly after we looked.
3. **Optional:** In one run, add a temporary 2s delay before calling `performAutoCommit` (e.g. in process-webhook right before we call it). If that run commits successfully and we’ve seen “no changes” on the same project/card before without the delay, that supports the race.

## How to disprove the race

1. **Show completion is after all writes:** Prove that the SDK’s async iterator only completes **after** the Claude Code process has flushed/synced all file writes (e.g. from SDK or Claude Code docs/source). Then there is no race.
2. **Show another cause:** Prove that when we saw “no changes”, we were actually running `git status` in a **different** directory (e.g. wrong path at runtime). We already checked: path in DB matches the clone; we’d need to log the **exact** path and cwd at the moment of `getStatusPorcelain` to be sure.
3. **Reproduce without race:** If we can’t reproduce “no changes” on a run that definitely wrote files (e.g. with instrumentation and many runs), and the only occurrence was that one run, we can’t rule out a one-off (e.g. process kill, FS glitch) rather than a systematic race.

## Next step

Add **minimal instrumentation only**: in `performAutoCommit`, log `worktreePath` and `statusResult.lines.length`. No retry, no delay. On the next “no changes” occurrence, we’ll have the path and whether git saw 0 lines. If we then add a one-off “if 0 lines, wait 1s and log second line count” (diagnostic only, still return no_changes), we get direct evidence on the next run: “first 0, second N” would validate the race.
