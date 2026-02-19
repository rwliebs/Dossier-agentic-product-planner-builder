# ADR 0008: Build Orchestration via Agentic-Flow

- Status: Accepted (updated)
- Date: 2026-02-18 (updated 2026-02-19)
- Supersedes: 0006-claude-flow-execution-plane

## Context

Dossier defines policy and run boundaries. Execution must occur in an isolated, bounded system that respects those constraints. ADR 0006 adopted claude-flow as the execution plane, but claude-flow lacks a programmatic API and required a subprocess adapter. Agentic-flow provides a more mature ecosystem with agent definitions, MCP tools, and easier integration.

## Decision

Use `agentic-flow` as the execution plane for build orchestration via its **programmatic API** (not the CLI).

- Dossier remains control plane and policy authority.
- `agentic-flow` executes assignments within Dossier-provided envelopes.
- Worktree and branch constraints remain mandatory.
- Approval and merge gates remain user-controlled.

### Programmatic Invocation (verified working, creates files on disk)

The client imports agentic-flow's `claudeAgent` function and `getAgent` loader directly from the package internals:

```typescript
// Imports from agentic-flow's dist (alpha publishes nested: agentic-flow/agentic-flow/dist/)
const { claudeAgent } = await import("file://" + path.join(distRoot, "agents", "claudeAgent.js"));
const { getAgent } = await import("file://" + path.join(distRoot, "utils", "agentLoader.js"));

const agent = getAgent("coder"); // Loads from .claude/agents/core/coder.md
const result = await claudeAgent(agent, taskDescription, streamHandler);
```

This path:
- Loads the `coder` agent definition (system prompt, capabilities) from agentic-flow's `.claude/agents/` registry.
- Calls `query()` from `@anthropic-ai/claude-agent-sdk` with `permissionMode: 'bypassPermissions'` and `allowedTools: ['Write', 'Edit', 'Bash', 'Read', 'Glob', 'Grep', ...]`.
- The agent **actually creates files on disk** via the Write tool.

### Why not the CLI?

The agentic-flow CLI (`npx agentic-flow --agent coder --task "..."`) routes through `cli-proxy.js` → `claudeAgentDirect` which calls `anthropic.messages.create()` — a plain text completion with **no tool execution**. It cannot create files. This is true for both v2.0.7 (stable) and v2.0.2-alpha.

### Required packages

```json
{
  "agentic-flow": "alpha",
  "@anthropic-ai/claude-agent-sdk": "^0.2.47",
  "agent-booster": "^0.2.2"
}
```

All three are required: `agentic-flow` for agent definitions/routing, `@anthropic-ai/claude-agent-sdk` for the `query()` function with tools, `agent-booster` as a transitive dependency of the alpha's `claudeAgent` import chain.

### External MCP servers disabled

The client sets `ENABLE_CLAUDE_FLOW_MCP=false`, `ENABLE_FLOW_NEXUS_MCP=false`, `ENABLE_AGENTIC_PAYMENTS_MCP=false`, `ENABLE_CLAUDE_FLOW_SDK=false` to avoid spawning unnecessary external processes.

## Consequences

- Clear separation of control vs execution concerns.
- Agent actually creates files on disk (proven with Write tool).
- agentic-flow provides agent definitions, system prompts, retry logic, multi-provider routing.
- `@anthropic-ai/claude-agent-sdk` provides the tool-executing `query()` function.
- Webhook path: `/webhooks/agentic-flow`.
- Fire-and-forget async execution with AbortController-based cancellation.

## Alternatives Considered

- **agentic-flow CLI** (`npx agentic-flow --agent ...`): rejected — uses `claudeAgentDirect` with no tools; cannot create files.
- **Direct `query()` without agentic-flow**: works but loses agent definitions, system prompts, and agentic-flow ecosystem features.
- **Keep claude-flow**: rejected — subprocess adapter was fragile; agentic-flow has broader ecosystem.
- **`npx agentic-flow init` + hooks**: the README's intended integration path for Claude Code; viable for future enhancement but not required for programmatic dispatch.
