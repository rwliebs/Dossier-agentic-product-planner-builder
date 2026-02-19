# ADR 0006: Build Orchestration via Claude-Flow

- Status: Superseded by 0008
- Date: 2026-02-12
- Supersedes: 0006-agentic-flow-execution-plane (agentic-flow scrapped)

## Context

Dossier defines policy and run boundaries. Execution must occur in an isolated, bounded system that respects those constraints.

## Decision

Use `claude-flow` as the execution plane for build orchestration.

- Dossier remains control plane and policy authority.
- `claude-flow` executes assignments within Dossier-provided envelopes.
- Worktree and branch constraints remain mandatory.
- Approval and merge gates remain user-controlled.
- Self-deploy: claude-flow runs in-process. No agentic-flow.

## Consequences

- Clear separation of control vs execution concerns.
- Better scalability for multi-agent execution.
- Requires robust status/event reconciliation between systems.

## Alternatives Considered

- Direct execution inside Dossier without claude-flow: rejected for weaker separation and scaling concerns.
- Agentic-flow (HTTP/MCP): scrapped — we use claude-flow only.
