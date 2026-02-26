# Architect Evaluation: Claude Flow Programmatic SDK vs Dossier Requirements

**Role:** Architect (`.cursor/agents/architect.md`)  
**Date:** 2026-02-26  
**Scope:** Evaluate [Claude Flow (Ruflo) Programmatic Usage](https://github.com/ruvnet/claude-flow#-programmatic-usage) against Dossier’s orchestration and memory requirements; recommend integration path.

---

## 1. Frame the Architecture Decision

- [ ] **Problem:** We need a stable, programmatic way to run multi-agent builds with run lifecycle (start/status/cancel), loop policy (retry until checks pass or budget), and memory contract (seed → execute → harvest with provenance). Today this is only partially available: we use agentic-flow internals + single coder agent + in-memory registry; the strategy doc describes claude-flow MCP + swarm + RuVector.
- [ ] **Constraints:** Dossier is control plane; execution must respect worktree/branch and policy snapshots; no auto-merge; memory must support project/card provenance; dedicated host acceptable for long-running agents.
- [ ] **Quality attributes:** Reliability (observable runs, clear terminal states), maintainability (typed contracts, few moving parts), security (scoped paths, no policy bypass).
- [ ] **Decision horizon:** Now (clarify execution plane and SDK vs MCP); next quarter (multi-agent + seed/harvest); long term (loop policy, check-gated convergence).

---

## 2. Current-State Diagnosis

| Aspect | Current implementation | Strategy / ADR target |
|--------|------------------------|-------------------------|
| **Execution plane** | agentic-flow (ADR 0008): `getAgent("coder")` + `@anthropic-ai/claude-agent-sdk` `query()` in-process | Strategy: claude-flow MCP server on dedicated host |
| **Agents** | Single agent (coder) | Strategy: architect → coder → tester → reviewer (hierarchical swarm) |
| **Run lifecycle** | In-memory registry + AbortController; `dispatch` → async `runExecution` → webhook | Proposed: `startRun` → runId, `getRunStatus`, `cancelRun` |
| **Memory** | None (no seed/harvest; optional `memory_context_refs` in payload, not wired to vector store) | Strategy: seed via `memory_store`, retrieve via `memory_search`, harvest via `memory_list`; Postgres `memory_unit` + RuVector |
| **Loop policy** | None (single pass; retry only for transient SDK errors) | Proposed: maxIterations, maxDurationMs, success criteria (lint/unit/etc.), terminal reasons |
| **API surface** | Dossier-owned `AgenticFlowClient`: `dispatch`, `status`, `cancel`; implementation uses agentic-flow dist via `file://` import | Proposed: first-class orchestrator API (createOrchestrator, startRun, seedMemory, harvestMemory) in upstream or our facade |

**Conclusion:** We have a minimal programmatic path (agentic-flow + SDK) that creates files and supports cancel; we do not have swarm, memory, or loop policy. The strategy document assumes claude-flow (Ruflo) as the execution plane with MCP; ADR 0008 chose agentic-flow for programmatic use because claude-flow lacked a programmatic API at the time.

---

## 3. Claude Flow (Ruflo) Programmatic Offerings vs Requirements

Source: [claude-flow README – Programmatic Usage](https://github.com/ruvnet/claude-flow#-programmatic-usage).

### 3.1 Run lifecycle (our proposal: createOrchestrator, startRun, getRunStatus, cancelRun)

| Our requirement | Claude Flow SDK | Gap |
|-----------------|------------------|-----|
| createOrchestrator(config) | `createSwarm({ topology, maxAgents, strategy })` | Swarm is created per “session”; no explicit “orchestrator” with run handle. |
| startRun(input) → runId | `swarm.orchestrate({ task, strategy })` returns result, not a persistent runId for polling | No first-class run handle; orchestrate() is blocking/async to completion. |
| getRunStatus(runId) | `swarm_status`, `agent_list`, `task_status` (MCP tools); not clearly exposed as one “run” in SDK | Status is via MCP or internal state; no documented `getRunStatus(runId)` in SDK. |
| cancelRun(runId) | `swarm.shutdown({ graceful: true })`; MCP `tasks/cancel` | Cancellation is swarm-wide or task-level; no documented run-scoped cancel by runId in SDK. |

**Verdict:** Claude Flow provides swarm + task orchestration and MCP tools for status/cancel, but not a single “orchestrator” API with run handle and run-scoped status/cancel. We would need an **orchestrator facade** in Dossier that maps our runId to one swarm (or task) and wraps status/cancel.

### 3.2 Loop policy (maxIterations, maxDurationMs, success criteria, terminal reason)

| Our requirement | Claude Flow SDK | Gap |
|-----------------|------------------|-----|
| maxIterations / maxDurationMs | Not in programmatic docs | Not exposed; we’d implement in our facade (retry loop around orchestrate or MCP calls). |
| Success criteria (lint/unit/custom) | Hooks (e.g. post-task), workers (audit, testgaps) | Hooks/workers are building blocks; no documented “run until these checks pass” policy in SDK. |
| Terminal reason (converged / budget / failed / cancelled) | Swarm/orchestrate result; no standard enum | We’d define terminal reasons in our facade from swarm/orchestrate outcome and our time/iteration limits. |

**Verdict:** Loop policy is **not** provided by Claude Flow SDK; we must implement it in our own orchestration layer (same as with agentic-flow today).

### 3.3 Memory contract (seedMemory, searchMemory, harvestMemory with provenance)

| Our requirement | Claude Flow SDK | Gap |
|-----------------|------------------|-----|
| seedMemory(runId, entries[]) | `AgentDB` `store()`, `memory_store` (MCP); per-build “namespace” is not a first-class runId in SDK | We can store entries before run; namespace/scope is our choice (e.g. runId or cardId). Provenance (project, run, card) we add in content or metadata. |
| searchMemory(query, scope, topK) | `db.search(..., { topK, minSimilarity })`, `memory_search` (MCP) | Scope (project/card) we enforce via our keys/namespaces or MCP params; SDK supports search. |
| harvestMemory(runId, artifacts, scores) | `memory_list` (MCP); ReasoningBank / LearningBridge for patterns | Harvest = “read back what the run produced”; MCP `memory_list` + our persistence to Postgres `memory_unit` with `embedding_ref`. Provenance we add in Dossier. |

**Verdict:** Memory **building blocks** exist (AgentDB store/search, MCP memory_store/search/list). There is no explicit `seedMemory`/`harvestMemory` with built-in provenance; we implement the contract in our layer (seed before run, harvest after run, write to Postgres + RuVector with our provenance model).

### 3.4 Multi-agent swarm (architect → coder → tester → reviewer)

| Our requirement | Claude Flow SDK | Gap |
|-----------------|------------------|-----|
| Hierarchical swarm, multiple roles | `createSwarm({ topology: 'hierarchical', ... })`, `swarm.spawn('coder'|'tester'|...)`, `swarm.orchestrate({ task, strategy })` | Supported. We configure agents and task; no predefined “architect→coder→tester→reviewer” pipeline in one call—we compose it (e.g. one orchestrate with the right task description, or multiple spawn + handoff). |

**Verdict:** Swarm and multi-agent coordination are supported; we need to define our pipeline (roles + order) in config or a small wrapper.

---

## 4. Target Architecture (Components + Interfaces)

- **Control plane (Dossier):** Owns runs, assignments, policy snapshots, approval gates, and memory content in Postgres. Exposes APIs for trigger, status, cancel, and memory CRUD.
- **Orchestrator facade (Dossier or dedicated host):** Implements our contract:
  - **Run lifecycle:** startRun(input) → runId; getRunStatus(runId); cancelRun(runId). Internally: create swarm (or reuse pool), call Claude Flow SDK `orchestrate()` or MCP `tools/call` with task, map runId ↔ swarm/task for status/cancel.
  - **Loop policy:** Our code: retry loop with maxIterations/maxDurationMs, run checks after each iteration, set terminal reason (converged / budget exhausted / failed / cancelled).
  - **Memory contract:** seedMemory(runId, entries) = write to AgentDB or MCP `memory_store` with namespace/runId; searchMemory = AgentDB/MCP `memory_search` with scope; harvestMemory(runId) = read from swarm memory / MCP `memory_list`, persist to Postgres `memory_unit` with provenance.
- **Execution plane (Claude Flow):** Either (A) in-process `@claude-flow/swarm` + `@claude-flow/memory` on a dedicated Node service, or (B) claude-flow MCP server on dedicated host; facade talks to MCP over HTTP. Both provide swarm + memory; (A) avoids network and gives typed SDK; (B) matches current strategy doc and isolates long-running agents.

**Data flow (high level):**
- Trigger build → Dossier creates run/assignments → Orchestrator facade starts run (create swarm / MCP dispatch), seeds memory → Execution plane runs agents → Facade polls status / subscribes to events → On completion/failure/cancel, facade harvests memory and updates run state → Dossier writes memory_unit + event_log.

---

## 5. Options and Recommendation

### Option A: Stay on agentic-flow; add orchestrator facade in Dossier only

- **Approach:** Keep current agentic-flow + SDK + single coder agent. Implement run lifecycle (we already have dispatch/status/cancel), then add loop policy and memory in our facade; memory backend could be our own (e.g. Postgres + optional vector) or we add MCP client to a separate claude-flow instance later.
- **Benefits:** No new runtime dependency; full control over contract; aligns with ADR 0008.
- **Risks:** No multi-agent swarm or RuVector unless we integrate them ourselves; we already proposed the programmatic API to agentic-flow and it may or may not land.

**Recommendation:** Use as **short-term baseline** (we already have it). Not sufficient for strategy’s multi-agent + seed/harvest without significant new work.

### Option B: Adopt Claude Flow as MCP server (strategy doc path)

- **Approach:** Run claude-flow MCP server on dedicated host. Dossier (or a small “orchestrator” service on same host) calls MCP over HTTP: `tools/call` (swarm_init, agent_spawn, task_orchestrate, memory_store, memory_search, memory_list), `tasks/status`, `tasks/cancel`. Our facade implements runId, loop policy, and seed/harvest/provenance.
- **Benefits:** Matches dual-llm strategy; swarm + RuVector + memory tools in one place; no in-process agent processes in Dossier.
- **Risks:** MCP is the only contract (no typed SDK for run lifecycle); we depend on MCP tool names and payloads; debugging across process boundary.

**Recommendation:** **Preferred for next phase** if we want swarm + RuVector without embedding Claude Flow in our app. Align strategy doc and ADR: document “execution plane = claude-flow MCP” and “orchestrator facade in Dossier (or on same host) implements run lifecycle and memory contract.”

### Option C: Adopt @claude-flow/* SDK in-process on dedicated host

- **Approach:** Run a Node service (e.g. on Railway/Fly) that depends on `@claude-flow/swarm`, `@claude-flow/memory`, `@claude-flow/hooks`. This service implements our orchestrator API (startRun → runId, getRunStatus, cancelRun, seedMemory, harvestMemory) and exposes them via HTTP or MCP for Dossier to call.
- **Benefits:** Typed SDK; single process for orchestration + swarm; no MCP for Dossier↔orchestrator if we expose REST; we control run handle and loop policy in one codebase.
- **Risks:** We own and maintain this service; must pin and upgrade @claude-flow/*; agentic-flow is a peer of claude-flow (version matrix).

**Recommendation:** **Strong alternative** if we want a single, typed “orchestrator API” and are willing to host and maintain that service. Can later expose MCP from this service so strategy’s “MCP to claude-flow” becomes “MCP to our orchestrator service (which uses Claude Flow SDK).”

---

## 6. Recommendation Summary

- **Claude Flow’s programmatic docs do not fully satisfy our proposed API** as-is: they provide swarm, memory, and hooks as building blocks, but not a first-class “orchestrator” with run handle, run-scoped status/cancel, or loop policy. **We implement the orchestrator contract in our own facade** in all options.
- **Recommendation:**  
  - **Now:** Keep current agentic-flow-based client for single-agent builds; document that the “programmatic orchestration API” we proposed (run lifecycle, loop policy, memory contract) is **our** contract to implement, not something we expect from a single upstream package.  
  - **Next:** Prefer **Option B (Claude Flow MCP server)** to reach swarm + RuVector + memory with minimal new code; implement orchestrator facade in Dossier that uses MCP (tools/call, tasks/status, tasks/cancel, memory_*) and adds runId, loop policy, and seed/harvest/provenance.  
  - **Alternative:** If we want a single typed API and can host an extra service, implement **Option C** (orchestrator service using @claude-flow/* SDK) and have Dossier call that service (HTTP or MCP).

---

## 7. Migration Plan by Phase

### Phase 1 (minimum safe step)

- Document in ADR or strategy: “Orchestrator contract (run lifecycle, loop policy, memory contract) is implemented by Dossier (or a dedicated orchestrator service); execution plane (agentic-flow today, claude-flow later) provides agents and optional memory/swarm.”
- Add a one-page “Execution plane options” to `docs/domains/orchestration-reference.md`: current (agentic-flow + SDK), target (claude-flow MCP or orchestrator service with @claude-flow/*).
- No code change required for Phase 1.

### Phase 2 (stabilization)

- If choosing MCP path: add MCP client in Dossier (or thin service) to call claude-flow: swarm_init, agent_spawn or task orchestration, memory_store, memory_search, memory_list, tasks/status, tasks/cancel. Map our runId to one “logical run” (e.g. one task or one swarm per run).
- Implement seed step before dispatch (write card context + retrieved memory into claude-flow memory via MCP).
- Implement harvest step after completion (read from claude-flow, write to Postgres memory_unit with provenance).
- Keep existing agentic-flow client as fallback when claude-flow is unavailable (mock or single-agent).

### Phase 3 (optimization)

- Add loop policy in facade: maxIterations, maxDurationMs, run checks after each iteration, set terminal reason.
- Optional: replace MCP client with orchestrator service (Option C) that uses @claude-flow/* and exposes REST or MCP for Dossier.

---

## 8. Risks, Unknowns, Assumptions

| Risk | Mitigation |
|------|-------------|
| Claude Flow (Ruflo) alpha instability | Pin version; mock client when unavailable; strategy already calls this out. |
| MCP tool names/contracts change | Pin claude-flow version; wrap MCP in a small adapter layer so only adapter touches tool names. |
| Run handle semantics (runId ↔ swarm/task) | Define explicitly: one run = one swarm or one task in claude-flow; document in orchestration reference. |

**Unknowns:** Exact MCP tool signatures for swarm + task + memory in the version we’d adopt; whether `tasks/status` is per-task or per-session.

**Assumptions:** Strategy’s “claude-flow MCP server on dedicated host” remains the intended deployment; Dossier stays the control plane and never runs long-lived agent processes itself (Vercel/serverless).

---

## 9. What-to-Build-Next Checklist

- [ ] Update `docs/domains/orchestration-reference.md` with “Execution plane: current vs target” and orchestrator-contract ownership.
- [ ] Decide: Option B (MCP) vs Option C (orchestrator service with SDK); record in strategy or ADR.
- [ ] If Option B: spike MCP client to claude-flow (swarm_init, memory_store, memory_search, one task flow); validate runId → task mapping and status/cancel.
- [ ] If Option C: spike small Node service with @claude-flow/swarm + @claude-flow/memory; implement startRun, getRunStatus, cancelRun, seedMemory, harvestMemory (in-memory or file for spike).
- [ ] Implement seed step (pre-dispatch) and harvest step (post-completion) in Dossier for one build path; persist to Postgres memory_unit with provenance.
- [ ] Leave loop policy (maxIterations, maxDurationMs, check-gated convergence) for after seed/harvest is stable.
