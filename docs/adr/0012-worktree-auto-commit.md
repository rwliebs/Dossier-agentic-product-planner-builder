# ADR 0012: Worktree Auto-Commit

**Date**: 2026-02-21
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#data-flow, docs/domains/orchestration-reference.md#flow

## Context

Build agents write files to a repo clone but may not commit them. The files pane uses `git ls-tree` and `git diff` which require committed state. Checks also need to run against committed code.

## Decision

Dossier owns auto-commit. After `execution_completed`, before checks:

1. Verify current branch matches `feature_branch`
2. List changed files via `git status --porcelain`
3. Exclude build artifacts (`.next/`, `node_modules/`, `dist/`, `test-results/`, etc.)
4. Stage eligible paths: intersection of changed paths with `allowed_paths` + root allowlist (`package.json`, `tsconfig.json`, `__tests__/`, etc.)
5. Commit with message `feat: <card title>`
6. Insert `agent_commit` record; log `commit_created` event

If no eligible changes exist: mark assignment `blocked` with reason; skip checks.

**Safe git usage**: `spawnSync`/`execFileSync` with argument arrays only — never shell string concatenation.

## Consequences

- Files pane shows agent output immediately after build
- Checks run against committed state
- Audit trail via `agent_commit` records
- `blocked` state surfaces "agent produced nothing" clearly to user

## Rollback

Remove auto-commit; require agent to commit directly (current agent toolset includes `Bash` so it can `git commit`).
