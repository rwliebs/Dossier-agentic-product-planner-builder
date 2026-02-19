---
document_id: doc.orchestration
last_verified: 2026-02-18
tokens_estimate: 750
tags:
  - orchestration
  - build
  - runs
anchors:
  - id: contract
    summary: "OrchestrationRun → CardAssignment; checks before approval; PR user-gated"
  - id: flow
    summary: "createRun → assignments → agentic-flow → checks → approval → PR"
  - id: policy
    summary: "SystemPolicyProfile: required_checks, protected_paths, forbidden_paths"
ttl_expires_on: null
---
# Orchestration Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: OrchestrationRun has immutable system_policy_snapshot and run_input_snapshot
- INVARIANT: Approval requested only after required checks pass
- INVARIANT: PR creation and merge remain user-gated; no auto-merge to main

### Boundaries
- ALLOWED: createRun, createAssignment, execute checks, create approval request, create PR candidate
- FORBIDDEN: Auto-merge; skipping required checks; merging without user action

---

## Implementation

### Run Lifecycle
```
User trigger (card | workflow)
  → ensureClone (repo to ~/.dossier/repos/<projectId>/) — single-card only for MVP
  → createRun (validate policy, capture snapshots; worktree_root = clone path)
  → createFeatureBranch per card
  → createAssignment per card (feature_branch, worktree_path, allowed_paths, forbidden_paths)
  → dispatch to agentic-flow (cwd = worktree_path)
  → agents write files, commit to feature branch
  → GET /api/projects/[id]/files?source=repo surfaces produced files with diff status
  → execute checks (dependency, security, policy, lint, unit, integration, e2e)
  → approval gates: request approval only if checks pass
  → createPullRequestCandidate (draft)
  → user reviews, approves merge
```

### Scope Rules
- `scope=workflow` → workflow_id required, card_id null
- `scope=card` → card_id required

### Key Files
| File | Purpose |
|------|---------|
| `lib/orchestration/repo-manager.ts` | ensureClone, createFeatureBranch; clone to ~/.dossier/repos/ |
| `lib/orchestration/repo-reader.ts` | getRepoFileTree, getChangedFiles, getFileContent, getFileDiff |
| `lib/orchestration/create-run.ts` | createRun; policy validation; snapshot capture |
| `lib/orchestration/create-assignment.ts` | CardAssignment per card |
| `lib/orchestration/trigger-build.ts` | Entry point; clones repo, creates branch, populates worktree_path |
| `lib/orchestration/dispatch.ts` | Dispatch to agentic-flow |
| `lib/orchestration/execute-checks.ts` | Run required checks |
| `lib/orchestration/approval-gates.ts` | Check pass before approval request |
| `lib/orchestration/create-approval-request.ts` | ApprovalRequest creation |
| `lib/orchestration/create-pull-request-candidate.ts` | Draft PR creation |
| `lib/orchestration/run-validation.ts` | validateRunInputAgainstPolicy |

### Policy Profile
- required_checks: runCheckType[]
- protected_paths, forbidden_paths
- dependency_policy, security_policy, architecture_policy, approval_policy

---

## Verification
- [ ] Run input validated against active policy before create
- [ ] Assignment snapshots immutable
- [ ] No approval request without required checks completed

## Related
- [worktree-management-flow.md](../strategy/worktree-management-flow.md)
- [memory-reference.md](memory-reference.md)
