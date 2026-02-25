# Push and merge flow: from “I like the code” to main

**Goal:** One clear path for the user to get a completed card’s code onto GitHub and merged to main, with minimal manual steps.

---

## MVP (shipped)

**One click to get code onto GitHub.**

- **Merge** button on a completed card: calls `POST …/cards/[cardId]/push`, which pushes that card's feature branch from the local clone to `origin` (using `GITHUB_TOKEN`). On success: open the repo in a new tab and toast "Branch pushed to GitHub. Create a pull request there to merge." On failure: toast the error (e.g. no token, no completed build).
- User then creates the PR and merges on GitHub. No compare URL or extra UI yet.

---

## User story

1. User finishes a build; they review the code in the **Files** tab and are happy.
2. User wants that code on GitHub and eventually on `main`.
3. User should not have to remember clone paths, branch names, or git commands unless they want to.

---

## Proposed flow (three steps)

### Step 1: Push branch to GitHub

**User action:** On a **completed** card, click **Push** (new button, or repurpose **Merge** to do this first).

**System:**

- Resolve the card’s latest **completed** run → assignment → `feature_branch` and clone path (`~/.dossier/repos/<projectId>/`).
- In that clone: `git push -u origin <feature_branch>` (using `GITHUB_TOKEN` from env or `~/.dossier/config` for auth).
- If the repo is empty or has no remote: show a short message (“Connect and push: set repo URL and ensure the repo exists on GitHub”) and don’t run push.
- On success: toast “Branch pushed to GitHub.” Optionally open the GitHub compare URL (see below).
- On failure: toast with error (e.g. “Push failed: permission denied” or “remote not found”).

**Implementation:** New API e.g. `POST /api/projects/[projectId]/cards/[cardId]/push` that (1) finds latest completed run/assignment for that card, (2) runs `git push origin <feature_branch>` from the clone, (3) returns success or error. Frontend: **Push** button on completed cards that calls this and shows toast; optionally open compare URL on success.

---

### Step 2: Open PR on GitHub

**User action:** After push, click **Merge** (or **Open PR**).

**System:**

- Build GitHub “compare” URL from project’s `repo_url` and assignment’s `feature_branch` and `base_branch` (e.g. `main`):
  - `https://github.com/<owner>/<repo>/compare/<base_branch>...<feature_branch>?expand=1`
- Open that URL in a new tab. User lands on GitHub’s “Open a pull request” page with base and head already set.
- User writes title/description on GitHub and creates the PR.

**Implementation:** Merge button (or new “Open PR” button) calls the push API if not yet pushed (or checks a “last pushed” hint), then opens the compare URL. If we don’t want to require push first, **Merge** can just open compare URL (push can be a separate **Push** step). So: **Push** = push branch; **Merge** = open compare URL (and optionally run push if needed).

---

### Step 3: Merge PR on GitHub

**User action:** On GitHub, review the PR and click “Merge” (squash/merge or merge commit, per repo settings).

**System:** Nothing. Merge is done on GitHub. Optionally we could later add “Mark PR merged” in Dossier to update PR candidate status, but it’s not required for this flow.

---

## Summary: what the user does

| Step | User does | System does |
|------|-----------|-------------|
| 1 | Clicks **Push** on a completed card | Pushes that card’s feature branch from the local clone to `origin` (using GITHUB_TOKEN). |
| 2 | Clicks **Merge** (or **Open PR**) | Opens GitHub compare URL (base...head) so user can create the PR in one click. |
| 3 | On GitHub: Create PR → Review → Merge | — |

No terminal, no memorizing paths or branch names, unless they want to.

---

## UI changes (minimal)

- **Completed cards:** Show **Push** (and keep **Merge** as “Open PR” / compare URL).
  - Or: **Merge** = “Push then open PR” (one click: push if needed, then open compare URL).
- **Push:** Only enabled when card has a completed build (we have a run/assignment with `feature_branch`). Disabled with tooltip if no completed run.
- **Merge:** Opens compare URL; if branch not pushed yet, toast: “Push the branch first (Push button), then open PR.”

---

## Edge cases

- **Repo empty on GitHub:** Push will create the branch on origin. If the repo is brand new with only a default branch, that’s fine.
- **No GITHUB_TOKEN:** Push fails; show “Add GITHUB_TOKEN to ~/.dossier/config or env to push.”
- **Multiple builds for same card:** Use the latest run for that card with status `completed` and an assignment that has `feature_branch` and `worktree_path`.

---

## Out of scope (for this flow)

- Creating the PR via GitHub API from Dossier (we can add later; for now, opening compare URL is enough).
- Auto-merging to main from Dossier (user merges on GitHub).
