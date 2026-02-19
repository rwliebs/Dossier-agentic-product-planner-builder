# O10: Claude-Flow Programmatic API Gap

## Summary

**RESOLVED 2026-02-18**: Dossier migrated from claude-flow to agentic-flow. This investigation applied to claude-flow (npm: `claude-flow`), which did **not** publish a documented programmatic Node.js API for in-process agent orchestration. The package was CLI-first.

## Current State

- **Package**: `claude-flow` (v3.1.0-alpha.44)
- **Entry**: `main: "dist/index.js"` — root `dist/` is not included in published `files`, so the package may not be importable from the root.
- **CLI**: `npx claude-flow swarm "<task>"` — task orchestration via subprocess.
- **Non-interactive**: `--no-interactive`, `--output-format json`, `CLAUDE_FLOW_NON_INTERACTIVE=true`.
- **Internal modules**: `v3/@claude-flow/shared` exports `createOrchestrator`, `TaskManager`, `LifecycleManager` — but these are internal and not part of the public API surface.

## Bridge Implementation

Until claude-flow publishes a stable programmatic API, Dossier uses a **subprocess adapter** that:

1. **dispatch**: Spawns `npx claude-flow swarm "<task>" --no-interactive --output-format json` with:
   - `cwd` = `payload.worktree_path ?? process.cwd()`
   - `env` = `{ ...process.env, ANTHROPIC_API_KEY, CLAUDE_FLOW_NON_INTERACTIVE: "true" }`
   - Task description from `buildTaskFromPayload(payload).taskDescription`
2. **status**: Tracks the spawned process; returns `running` while alive, `completed`/`failed` when exited.
3. **cancel**: Sends `SIGTERM` to the spawned process.

The adapter maintains a process registry keyed by `execution_id` (UUID). No claude-flow taskId/swarmId is required for status/cancel.

## Limitations

- No access to claude-flow's internal task state (progress, subtasks, agent outputs).
- Cancel is process kill only — no graceful swarm shutdown.
- Long task descriptions may hit OS `ARG_MAX`; consider temp-file fallback if needed.
- Single execution per client instance; process map is in-memory (not shared across workers).

## Future

Dossier now uses agentic-flow (npm: `agentic-flow`) as the execution plane. Agentic-flow provides a richer ecosystem (CLI, MCP tools, hooks). The subprocess adapter spawns `npx agentic-flow --agent coder --task "<task>"`. The `AgenticFlowClient` interface (with backward-compatible `ClaudeFlowClient` alias) remains unchanged.
