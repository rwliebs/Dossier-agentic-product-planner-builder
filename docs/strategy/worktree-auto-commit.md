# Worktree Auto-Commit Strategy

## Purpose
Define how Dossier automatically commits agent-produced files in build worktrees before running checks, ensuring the files pane and downstream flows see committed changes.

## Principles
- **Dossier owns commits**: The agent writes files; Dossier stages and commits them. This guarantees consistent commit metadata and artifact exclusion.
- **Commit before checks**: Auto-commit runs immediately on `execution_completed`, before `executeRequiredChecks`. Checks run against committed state.
- **Safe git usage**: Use `spawnSync`/`execFileSync` with argument arrays—never shell string concatenation—to avoid command injection.

## Priorities
1. Single-card builds with `worktree_path` set: full auto-commit flow.
2. Multi-card builds (no worktree yet): skip auto-commit; no-op.
3. Future: push and PR creation remain manual or separate automation.

## Opportunities
- Files pane (`GET /api/projects/[id]/files?source=repo`) shows committed files via `git ls-tree`; auto-commit makes agent output visible.
- `agent_commit` records enable audit trail and future PR creation.
- Structured git-ops helper supports future `git push` and GitHub API PR creation.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Committing build artifacts (node_modules, .next) | Explicit exclusion list; stage only eligible paths |
| Committing outside allowed_paths | Intersect changed paths with allowed_paths + root allowlist |
| No eligible changes (agent produced nothing) | Return `no_changes`; mark build `blocked` with reason |
| Git command injection | Use `spawnSync('git', ['add', path])`—never `exec('git add ' + path)` |
| Wrong branch or worktree | Verify current branch matches `feature_branch` before staging |

## Artifact Exclusions
Always exclude from staging:
- `.next/`, `node_modules/`, `dist/`, `build/`, `coverage/`
- `test-results/`, `playwright-report/`
- `*.tsbuildinfo`, `*.log`

## Root Allowlist
Always allow (when changed) regardless of allowed_paths:
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.*.json`
- `next.config.js`, `playwright.config.ts`, `.eslintrc.json`
- `__tests__/` (test files)

## Inline Reference
```ts
/**
 * ARCH_REF: docs/strategy/worktree-auto-commit.md
 * Reason: Auto-commit policy, exclusions, and safe git usage.
 */
```
