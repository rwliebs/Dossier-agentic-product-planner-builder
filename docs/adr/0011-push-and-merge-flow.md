# ADR 0011: Push and Merge Flow

**Date**: 2026-02-22
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#data-flow, docs/domains/orchestration-reference.md#flow

## Context

After a card build completes, the user needs to get the code from the local clone to GitHub and eventually to `main`. The question was how much of the PR lifecycle to automate.

## Decision

Minimal automation: push branch, then hand off to GitHub.

1. **Push**: User clicks "Push" on a completed card → `POST /api/projects/[projectId]/cards/[cardId]/push` → `git push -u origin <feature_branch>` from local clone using `GITHUB_TOKEN`
2. **PR creation**: User creates PR on GitHub (Dossier opens the repo URL; no GitHub API PR creation yet)
3. **Merge**: User merges on GitHub. No auto-merge from Dossier.

## Consequences

- One-click push from Dossier UI; no terminal or git commands required (card **Merge** pushes the branch and opens the repo; user creates the PR on GitHub)
- PR creation and merge remain fully user-controlled on GitHub
- `PullRequestCandidate` records exist in the DB but are not wired to GitHub API yet
- Future: GitHub API PR creation can be added without changing the push flow

## Rollback

Remove push endpoint; user manually pushes from terminal.

## Related

- [User Workflows Reference — GitHub integration: what works today](../product/user-workflows-reference.md#github-integration-what-works-today)
