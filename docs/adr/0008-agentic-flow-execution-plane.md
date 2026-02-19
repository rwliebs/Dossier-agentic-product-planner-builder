# ADR 0008: Build Orchestration via Agentic-Flow

- Status: Accepted
- Date: 2026-02-18
- Supersedes: 0006-claude-flow-execution-plane

## Context

Dossier defines policy and run boundaries. Execution must occur in an isolated, bounded system that respects those constraints. ADR 0006 adopted claude-flow as the execution plane, but claude-flow lacks a programmatic API and required a subprocess adapter. Agentic-flow provides a more mature ecosystem with CLI, MCP tools, and easier integration.

## Decision

Use `agentic-flow` as the execution plane for build orchestration.

- Dossier remains control plane and policy authority.
- `agentic-flow` executes assignments within Dossier-provided envelopes.
- Worktree and branch constraints remain mandatory.
- Approval and merge gates remain user-controlled.
- Self-deploy: agentic-flow runs in-process via subprocess adapter (CLI: `npx agentic-flow --agent coder --task "<task>"`).
- Future: agentic-flow's programmatic API and self-learning hooks can be adopted when needed.

## Consequences

- Clear separation of control vs execution concerns.
- Better scalability for multi-agent execution (66+ specialized agents).
- Simpler integration path than claude-flow (npm package, MCP tools, hooks).
- Subprocess adapter pattern retained until agentic-flow exposes direct programmatic API.
- Webhook path updated: `/webhooks/agentic-flow` (was `/webhooks/claude-flow`).

## Alternatives Considered

- Keep claude-flow: rejected — subprocess adapter was fragile; agentic-flow has broader ecosystem.
- Direct execution inside Dossier: rejected for weaker separation and scaling concerns.
