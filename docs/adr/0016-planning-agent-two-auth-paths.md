# ADR 0016: Planning Agent — Two Authentication Paths

- Status: Accepted
- Date: 2026-03-17
- Supersedes: Credential routing aspects of [ADR 0002](./0002-claude-first-no-provider-adapter.md)

## Context

The planning agent (scaffold, populate, finalize) needs to call Claude with optional codebase access. Over time, three separate execution paths emerged based on credential type:

1. **Messages API** (`new Anthropic({ apiKey }).messages.create()`) — for users with standard API keys (`sk-ant-api03-*`). Single-turn, no tool use, no codebase access.
2. **Agent SDK** (`query()` from `@anthropic-ai/claude-agent-sdk`) — for users with OAuth tokens (`sk-ant-oat-*`). Multi-turn with Read/Glob/Grep tools for codebase inspection.
3. **CLI subprocess** (`claude -p`) — for users with only the `claude` binary on PATH and no extractable credential. Single-turn, no tool control.

This created two problems:

- **Inconsistent planning quality.** API key users got the worst experience (no codebase tools), while OAuth token users got the best. The quality difference was invisible to users and depended entirely on credential type.
- **Three code paths to maintain.** Each path had its own timeout handling, error handling, streaming implementation, and message formatting. Bugs in one path did not exist in others (e.g., the stream double-close race only affected the CLI path).

The Agent SDK accepts both standard API keys and OAuth tokens via `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` respectively. There is no technical reason to route API key users away from it.

## Decision

Reduce to two authentication paths:

| User scenario | Credential resolution | Execution path |
|---|---|---|
| Has API key (env, config, or `~/.claude/settings.json`) | `resolvePlanningCredential()` returns value | Agent SDK `query()` |
| Has Claude Code installed (binary on PATH, no extractable credential) | `resolvePlanningCredential()` returns null, `isClaudeCliAvailable()` returns true | CLI subprocess `claude -p` |

### Tool availability

The planning agent's tools are determined by whether a repo is connected, not by credential type:

| Condition | Tools available |
|---|---|
| Repo connected (`cwd` provided) | Read, Glob, Grep, WebSearch |
| No repo connected | WebSearch |

WebSearch is always available so the planner can research technologies, frameworks, and patterns regardless of whether existing code is present.

### What is removed

- The `Anthropic Messages API` path (`new Anthropic({ apiKey }).messages.create/stream`) is removed from planning entirely.
- The `isLikelyApiKey()` function is no longer used for routing. It remains exported for tests but does not affect execution paths.
- The `@anthropic-ai/sdk` import is removed from `claude-client.ts`.

### What stays unchanged

- The CLI subprocess path (`claude -p`) remains as a fallback for users who have Claude Code installed but no credential in env/config/settings.
- Credential resolution order (`resolvePlanningCredential`): env → `~/.dossier/config` → `~/.claude/settings.json`.
- Agentic-flow (build execution) continues to use the Agent SDK directly with its own tool set.

## Consequences

- **All credentialed users get the same planning experience.** When a repo is connected, the planner can inspect it via Read/Glob/Grep regardless of credential type.
- **Planning latency may increase for API key users.** The Agent SDK spawns a subprocess and runs an agentic loop, which is heavier than a single Messages API call. This is the trade-off for codebase access.
- **Token cost may increase when repos are connected.** The agent may make multiple tool calls to explore the codebase, consuming more tokens than a single prompt-response cycle.
- **Two code paths instead of three.** Less surface area for bugs, simpler error handling, one streaming implementation per path.

## Alternatives Considered

- **Keep Messages API for API key users, add tools to it.** Rejected — the Messages API does not support agentic tool use (Read/Glob/Grep are Agent SDK tools, not function-calling tools).
- **Route all users through CLI subprocess.** Rejected — no programmatic control over tools, timeout handling, or model selection. The subprocess uses whatever the local `claude` binary is configured for.
- **Route OAuth users through CLI subprocess instead of Agent SDK.** Rejected — loses tool control and the ability to restrict to read-only operations.
