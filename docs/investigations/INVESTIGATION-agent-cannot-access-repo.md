# Investigation: Agent says it cannot access the repo (public repo)

## Context

- User added an existing repo with existing code (project linked to a public GitHub repo).
- The agent reported it couldn't access the repo.
- Not related to GitHub Enterprise.

## Possible sources of “can’t access the repo”

### 1. App error message (user paraphrasing)

Our code never uses the exact phrase “couldn’t access the repo.” Closest messages:

| Message | Where | When |
|--------|--------|------|
| `No repository connected. Connect a GitHub repository in project settings.` | trigger-build.ts | No `repo_url` or placeholder |
| `Repository clone failed.` / `Repo clone/fetch failed: <git message>` | trigger-build.ts ← repo-manager ensureClone | Clone or fetch throws |
| `Build misconfiguration: no worktree path. The agent must run in the project clone. Re-trigger the build from the project.` | dispatch.ts | Assignment has no `worktree_path` |
| `No build with repository available. Trigger a build first.` | files/route.ts | Files from repo requested but no run with worktree |

If the user saw one of these, they might describe it as “the agent said it couldn’t access the repo.”

### 2. Clone fails (public repo, non–Enterprise)

For a public repo, clone can still fail due to:

- **URL format**: Wrong or inconsistent `repo_url` (typo, missing `.git`, wrong scheme).
- **Network**: Timeout, DNS, firewall, proxy.
- **Local git**: `git` not on PATH or broken.
- **Disk**: No space or no write permission under `~/.dossier/repos/<projectId>/`.
- **Existing bad clone**: Clone dir exists but is corrupt or not a git repo; we only run `git fetch` and never re-clone, so a bad state can persist.

None of these are GitHub Enterprise–specific.

### 3. No worktree path (agent never runs)

If `worktree_path` is null on the assignment, we **do not** start the agent. We return:

`Build misconfiguration: no worktree path. The agent must run in the project clone. Re-trigger the build from the project.`

So the “agent” in that case is our API, not the LLM. User might still say “the agent said it couldn’t access the repo.”

Flow that can leave `worktree_path` null:

- `trigger-build` calls `ensureClone` → on success sets `clonePath`, then `worktreePath = clonePath` after `createFeatureBranch`.
- So null `worktree_path` only if clone failed (we return early) or `createFeatureBranch` failed (we never set `worktreePath` for that card). So the user would have seen a different error (clone failed or “Create branch failed”), not “no worktree path,” unless there’s another code path that creates assignments without a worktree.

### 4. LLM (coder) actually said it

If the **execution agent** (coder) ran and its **streamed reply** contained something like “I can’t access the repo”:

- We pass `cwd: payload.worktree_path` into the SDK. If the path is wrong or the SDK doesn’t use `cwd` for tools, the agent might see failures (e.g. list_dir/read_file) and conclude it “can’t access the repo.”
- Path might be wrong if: different filesystem (e.g. agent runs elsewhere), or `worktree_path` points to a dir that was removed or never created.

## Recommended next steps

1. **Pin down the exact message and moment**
   - Exact wording shown (UI or stream).
   - When it appears: on “Trigger build,” when opening “Files from repo,” or in the coder’s streamed text in the UI.

2. **If it’s a build error**
   - Check server logs for `Repo clone/fetch failed` or `Create branch failed` and the full error.
   - Confirm `repo_url` in DB for that project (no typo, correct format).
   - Manually run from app host:  
     `git clone "<repo_url>" /tmp/test-clone`  
     (and if clone exists: `git -C /tmp/test-clone fetch origin`).

3. **If it’s the coder’s streamed reply**
   - Confirm a build was triggered and an assignment had `worktree_path` set (e.g. from DB or logs).
   - Check that `~/.dossier/repos/<projectId>/` exists and is a valid git repo when the agent runs.
   - If the runtime is different from where the clone lives (e.g. different machine/container), then the `worktree_path` we pass may be invalid there — that would explain the agent “can’t access the repo” even though the repo is public and clone works on the main app host.

4. **Code-side checks**
   - In `repo-manager.ensureClone`, consider logging the resolved `clonePath` and clone/fetch success/failure (and full git stderr on failure).
   - In `dispatch.ts`, when sending the payload, log whether `worktree_path` is set and its value (path only, no secrets).
   - In `agentic-flow-client` (or SDK usage), confirm that the `cwd` we pass is the one actually used for file/tool operations.

## Summary

- “Couldn’t access the repo” is not from GitHub Enterprise; it can be (1) our error message paraphrased, (2) clone/fetch or branch creation failing for a public repo, (3) “no worktree path” before the agent runs, or (4) the coder LLM reporting failure when tools fail in the given `cwd`.
- Next: get exact message + when it appears, then follow the matching branch above and add the suggested logging to narrow it down.
