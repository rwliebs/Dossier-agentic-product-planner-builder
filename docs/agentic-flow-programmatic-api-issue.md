# GitHub issue copy: Programmatic orchestration API

**Repo:** https://github.com/ruvnet/agentic-flow  
**Use:** Copy the sections below into a new issue.

---

## Title

**Proposal: Programmatic orchestration API (run lifecycle, loop policy, memory contract)**

---

## Body

### Summary

We'd like to use agentic-flow's full orchestration (multi-agent flow, iterative runs until checks pass, vector memory) from another app via a **stable programmatic API**. Right now, that behavior is only reachable through MCP/CLI, so callers that need direct control (e.g. a build system dispatching runs and observing status) can't rely on a typed, in-process API. This issue proposes adding a first-class programmatic surface that keeps existing CLI/MCP behavior as thin adapters on top of the same runtime.

### Related issues

- **#110** (Top-level import not library-safe): This proposal assumes a library-safe entrypoint. We'd define the programmatic API as the surface exposed from that safe entry, so fixing #110 and adding this API go hand in hand.
- **#85** (Intelligent Hook Service with Swarm Orchestration): Complements the hook/orchestration work there; this proposal adds a stable programmatic API that external callers can use instead of (or in addition to) MCP.
- **#84** (RuVector Orchestration Layer): Would build on the orchestration layer direction there by defining the public API to that layer.

### Problem

- **MCP-only access:** Orchestration (routing, multi-agent coordination, workers, hooks) is exposed via MCP tools. Integrations that need to submit runs, wait for convergence, and harvest results have to go through MCP, which adds process boundaries and makes it harder to enforce loop policy and memory contracts in code.
- **Single-agent bypass:** Callers can use the SDK `query()` with one agent (e.g. `coder`) and agentic-flow's agent definitions, but that path doesn't use the orchestrator: no automatic multi-agent flow, no "retry until tests pass" loop, and no explicit memory seed/harvest contract. So they don't get the full value of agentic-flow.
- **No stable runtime contract:** There's no documented, versioned API for "start run → iterate until success/budget → harvest memory" that we can depend on from another codebase.

### Proposed direction

Add a **programmatic orchestration API** that:

1. **Run lifecycle**
   - `createOrchestrator(config)`
   - `startRun(input)` → returns a run handle
   - `getRunStatus(runId)`
   - `cancelRun(runId)`
   - Optional: `subscribeRunEvents(runId, handler)` or equivalent for iteration/check/memory events.

2. **Loop policy**
   - Configurable iteration limits (`maxIterations`, `maxDurationMs`, optional token budget).
   - Success criteria (e.g. lint/typecheck/unit/custom checks).
   - Retry/backoff by failure class and a clear terminal reason (converged / budget exhausted / failed / cancelled).

3. **Memory contract**
   - `seedMemory(runId, entries[])` before execution.
   - `searchMemory(query, scope, topK)` for retrieval.
   - `harvestMemory(runId, artifacts, scores)` (or equivalent) after run completion, with required provenance (e.g. project, run, card, agent) so harvest is auditable and reusable.

4. **Compatibility**
   - CLI and MCP command handlers call into this same runtime/API where possible, so behavior stays consistent and we don't duplicate orchestration logic.

### Why this is additive

- New exports and entrypoints only; no breaking changes to existing CLI/MCP surface.
- Existing users can keep using `npx agentic-flow ...` and MCP tools as today.
- Integrations that need direct control get a single, typed API instead of wrapping CLI/MCP.

### Implementation approach we have in mind

We're planning to implement this in **small PRs**:

- **PR 1:** API contracts + minimal run lifecycle (start / status / cancel), with existing CLI/MCP unchanged.
- **PR 2:** Iterative loop engine and check-gated convergence (retry until pass or budget).
- **PR 3:** Memory contract (seed / search / harvest) with provenance and tests.
- **PR 4 (optional):** Wire CLI/MCP to the new API where it's a clear win.

We're happy to adjust scope, naming, or export paths to match how you'd like the package to evolve.

### Questions for maintainers

1. **Export path:** Prefer a new subpath (e.g. `agentic-flow/orchestrator` or `agentic-flow/sdk/orchestrator`) or something else?
2. **Naming:** Is "orchestrator" the right term, or do you prefer "run engine", "runtime", or another name?
3. **RFC:** Would you want a short RFC doc in the repo (e.g. `docs/rfc-programmatic-api.md`) before the first PR, or is this issue enough?
4. **Dependencies:** Any constraints on how this should use existing hooks, workers, and memory tooling (e.g. must go through existing modules, no new top-level services)?

Thanks for building agentic-flow; we'd like to contribute this so that apps like ours can depend on full orchestration via a stable programmatic API.
