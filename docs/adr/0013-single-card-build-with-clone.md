# ADR 0013: Single-Card Build with Clone (No Worktree Isolation)

**Date**: 2026-02-20
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#data-flow, docs/domains/orchestration-reference.md#flow

## Context

The original strategy envisioned git worktree isolation per card for parallel multi-card builds. Implementation revealed this was premature: MVP scope is single-card builds, and worktree provisioning adds complexity for zero current benefit.

## Decision

Single-card builds use a full git clone at `~/.dossier/repos/<projectId>/`. No git worktrees.

- `ensureClone()` clones the repo if not already present
- `createFeatureBranch()` creates `feat/run-{runIdShort}-{cardIdShort}` from `baseBranch`
- One build at a time per project (single-build lock via running `OrchestrationRun` check)
- Agent CWD is the clone root
- `worktree_path` on `CardAssignment` points to the clone root (same as `worktree_root` on the run)

**Parallel multi-card builds via git worktrees** are deferred. See `docs/Feature Plans/multi-agent-swarm.md`.

## Consequences

- Simpler provisioning: one clone, one branch, one agent
- No worktree lifecycle to manage (creation, cleanup, conflict)
- Single-build lock prevents concurrent edit conflicts
- Multi-card builds require a future architecture change

## Rollback

Implement worktree provisioning per the original worktree-management-flow design.
