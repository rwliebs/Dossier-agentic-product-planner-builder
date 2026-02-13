# ADR 0006: Build Orchestration via Agentic-Flow

- Status: Accepted
- Date: 2026-02-12

## Context

Dossier defines policy and run boundaries. Execution must occur in an isolated, bounded system that respects those constraints.

## Decision

Use `agentic-flow` as the execution plane for build orchestration.

- Dossier remains control plane and policy authority.
- `agentic-flow` executes assignments within Dossier-provided envelopes.
- Worktree and branch constraints remain mandatory.
- Approval and merge gates remain user-controlled.

## Consequences

- Clear separation of control vs execution concerns.
- Better scalability for multi-agent execution.
- Requires robust status/event reconciliation between systems.

## Alternatives Considered

- Direct execution inside Dossier without `agentic-flow`: rejected for weaker separation and scaling concerns.
