# Worktree Management Flow

## Purpose
Define how `Dossier`, `agentic-flow`, and `GitHub` interact during build execution when worktrees are used for isolation.

This document is an implementation reference for run orchestration, branch strategy, assignment isolation, checks, and cleanup.

## System Roles

- `Dossier` (control plane):
  - Owns policy, run creation, worktree/branch topology decisions, assignment constraints, and approval gates.
  - Provisions execution envelopes (scope, branches, paths, snapshots).
- `agentic-flow` (execution plane):
  - Routes/coordinators workers and executes coding tasks inside Dossier-provided worktree and branch context.
  - Returns execution metadata (status, summaries, commit SHAs, errors).
- `GitHub` (remote source of truth):
  - Hosts remote branches, PRs, checks, and merge lifecycle.

## Example End-to-End Flow

Scenario: user triggers a `workflow` build with two cards (`card-a`, `card-b`).

### 1) Run Initialization (Dossier)

Dossier creates `OrchestrationRun` with:

- `scope = workflow`
- `repo_url = github.com/acme/app`
- `base_branch = main`
- immutable `system_policy_snapshot`
- immutable `run_input_snapshot`

Dossier selects branch/worktree strategy:

- umbrella branch: `feat/onboarding-flow`
- run root worktree dir: `/tmp/dossier/runs/run-123/`
- card worktrees:
  - `/tmp/dossier/runs/run-123/card-a`
  - `/tmp/dossier/runs/run-123/card-b`

### 2) Branch + Worktree Provisioning (Dossier-owned)

Dossier (or a Dossier-managed infra worker):

1. Syncs local repo with origin.
2. Creates `feat/onboarding-flow` from `main`.
3. Creates per-card branches:
   - `feat/onboarding-flow-card-a`
   - `feat/onboarding-flow-card-b`
4. Creates worktrees bound to those branches.
5. Persists `CardAssignment` records with:
   - `feature_branch`
   - `worktree_path`
   - `allowed_paths`
   - `forbidden_paths`
   - `assignment_input_snapshot`

### 3) Task Dispatch (Dossier -> agentic-flow)

Dossier sends agentic-flow a per-assignment payload:

- task intent and acceptance criteria
- branch + worktree location
- allowed/forbidden path policy
- approved context artifacts and memory references

agentic-flow executes workers within those constraints and produces commits on the assigned branch.

### 4) Execution Results (agentic-flow -> Dossier)

agentic-flow reports:

- assignment/run status
- summary and errors
- commit SHAs and branch refs

Dossier records these in `AgentExecution` and `AgentCommit`.

### 4a) Auto-Commit (Dossier-owned, single-card builds)

When `worktree_path` is set (single-card builds), Dossier automatically commits agent-produced files before running checks:

1. Verify current branch matches `feature_branch`
2. List changed files via `git status --porcelain`
3. Exclude build artifacts (`.next/`, `node_modules/`, `test-results/`, etc.)
4. Stage eligible paths (intersection with `allowed_paths` plus root allowlist)
5. Commit with message `feat: <card title>`
6. Insert `agent_commit` record and log `commit_created` event

If no eligible changes exist, the assignment is marked `blocked` and checks are skipped. See [docs/strategy/worktree-auto-commit.md](worktree-auto-commit.md).

### 5) Mandatory Checks (Dossier-owned gate)

Before any approval request, Dossier runs required checks:

- always-on checks: `dependency`, `security`, `policy`
- build checks (as required by policy): `lint`, `unit`, `integration`, `e2e`

If checks fail, run is blocked/failed and no PR approval request is issued.

### 5a) MVP Test-Gate Interpretation (Lean Core)

For MVP, the quality gate implementation is intentionally lean and high-signal:

- `lint`, `unit`, and `integration` are mandatory and treated as release-blocking.
- `e2e` is executed against a minimal adaptive suite for critical journeys.
- Contract and integration checks are the primary truth for run gating; adaptive E2E augments, not replaces, those gates.

### 6) PR Lifecycle (Dossier policy + GitHub operations)

If checks pass:

- Dossier consolidates branches (if multi-branch strategy) or uses umbrella branch directly.
- Dossier or agentic-flow PR mode creates a draft PR in GitHub.
- Merge to protected branches remains approval-gated by Dossier policy.

### 7) Merge and Cleanup

After merge approval and completion:

- Dossier marks run complete.
- Deletes temporary worktrees.
- Optionally prunes temporary branches.
- Retains immutable run/audit records and snapshots.

## Constraint Model

### Policy Precedence

1. `system_policy_snapshot` (highest authority)
2. `run_input_snapshot`
3. `assignment_input_snapshot`

Lower levels may narrow scope, never relax higher-level constraints.

### Path Isolation

- `allowed_paths` must be non-empty for coding assignments.
- `forbidden_paths` (if present) are enforced as hard deny.
- Changes outside allowed paths are rejected or rolled back by policy.

### Scope Isolation

- `workflow` scope may run multiple card assignments.
- `card` scope must remain card-bounded unless policy allows an integration task.

## Failure and Recovery Patterns

### Worker Failure

- Mark assignment `failed`.
- Keep worktree intact for diagnosis.
- Retry with new assignment snapshot when safe.

### Check Failure

- Block approval path.
- Preserve branch/worktree for patching.
- Re-run checks after remediation.

### Provisioning Failure

- Abort run before dispatch.
- Cleanup partial worktrees/branches.
- Emit failure event with root cause.

### Merge Conflict During Consolidation

- Trigger integration assignment.
- Re-run required checks post-resolution.
- Continue only after passing checks.

## Operational Recommendations

- Use deterministic naming for run/worktree/branch refs.
- Persist all snapshots at run start for auditability.
- Treat worktree creation/deletion as idempotent operations.
- Keep branch/worktree orchestration independent of authentication rollout stages; auth hardening can evolve without changing worktree isolation semantics.
- Emit structured events for each stage:
  - `run_initialized`
  - `worktree_provisioned`
  - `assignment_dispatched`
  - `assignment_committed`
  - `checks_completed`
  - `approval_requested`
  - `run_completed`

## Minimal Data Required Per Assignment

- `run_id`
- `card_id`
- `feature_branch`
- `worktree_path`
- `allowed_paths`
- `forbidden_paths` (optional)
- `assignment_input_snapshot`
- `memory_context_refs`
- `acceptance_criteria`

## Summary

Worktree management is a Dossier-governed isolation and policy mechanism.

- Dossier decides where and how work can happen.
- agentic-flow performs the work inside those boundaries.
- GitHub stores and governs remote branch/PR lifecycle.

This separation preserves safety while enabling parallel multi-agent execution.
