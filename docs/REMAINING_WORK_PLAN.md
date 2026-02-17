# Remaining Work Plan

> Generated 2026-02-17 from gap analysis against `dual-llm-integration` and `prototype_to_functional_mvp` plans.

## Status Summary

| # | Work Group | Status | Est. Days | Can Start Now |
|---|-----------|--------|-----------|---------------|
| 1 | Frontend Canonical Migration | Not started | 4-5 | Yes |
| 2 | Mutation Pipeline Hardening | Not started | 4-5 | Yes |
| 3 | Realtime Sync | Not started | 3 | Yes |
| 4 | Memory Plane (RuVector) | Not started | 5-6 | Yes |
| 5 | Orchestration Execution | Not started | 6-7 | Yes |
| 6 | Hardening & Go-Live | Not started | 7-8 | Partially |

**Total estimated: 15-20 days parallel, 30-34 days sequential.**

## What Is Already Done

- Phase 0: Strategy doc + full canonical schema (`DUAL_LLM_INTEGRATION_STRATEGY.md`)
- Step 2: Canonical Zod schemas, action validation, mutation logic (`lib/schemas/`, `lib/actions/`)
- Step 3: Supabase tables for Slice A/B/C, client setup, migrations
- Step 4: Full API layer — 28 route files under `app/api/projects/`
- Step 8: Planning LLM — Claude client, prompt, parser, chat endpoint, preview UI
- Step 9 foundation: Orchestration schemas, API, service layer, approval gates (stubs for execution)

## Parallelism

```
Track A (Frontend):   [Step 5] ──> [Step 6] ──> [Step 7]
Track B (Backend):    [Memory Plane] ──> [Orchestration Execution]
                          │                        │
Track C (Independent): [Auth/RLS] [Feature Flags] [Error Boundaries]
                                    │
Final:                         [Step 10 Hardening]
```

All tracks can start immediately. Track C items from Step 10 can start any time.

---

## 1. Frontend Canonical Migration

**Parent refs:** `prototype_to_functional_mvp` Step 5 · `dual-llm-integration` Phase 2 · Strategy §Phase 1

### Problem

Frontend uses prototype types (`Epic`, `UserActivity`, `Iteration`, `ContextDoc`) with a bridge adapter (`lib/map-adapter.ts`). Cards don't show planned files, knowledge item status, or build state. No data-fetching hooks — raw `fetch()` calls in `page.tsx`.

### Tasks

| ID | Task | Details |
|----|------|---------|
| 5a | Create data-fetching hooks | `lib/hooks/` — useProject, useMapSnapshot, useSubmitAction, useKnowledgeItems, usePlannedFiles, useArtifacts. Each returns `{ data, loading, error, refetch }` using canonical types. |
| 5b | Canonical UI type re-exports | `lib/types/ui.ts` re-exporting from `lib/schemas/`. Deprecate `components/dossier/types.ts`. |
| 5c | Migrate canvas components | IterationBlock → WorkflowBlock. EpicRow → WorkflowRow. ActivityColumn receives WorkflowActivity with Step[] children. Add StepGroup. |
| 5d | Migrate ImplementationCard | Canonical Card props. Add planned-file section with approval actions. Knowledge items with draft/approved/rejected badges. Build state indicator. |
| 5e | Migrate RightPanel | Replace mockFileTree and hardcoded terminalLines with live data. Docs tab renders ContextArtifact. |
| 5f | Migrate page.tsx state | useMapSnapshot(projectId) hook. Wire mutations through useSubmitAction(). Remove mapSnapshotToIterations. |
| 5g | Project selection flow | List/create projects. Selected project in URL param or localStorage. |
| 5h | Update smoke tests | Update existing tests with canonical props. Add tests for new components and hooks. |

### Type Mapping

| Prototype | Canonical | Change |
|-----------|-----------|--------|
| Iteration | Removed | Content → Project + workflow tree |
| Epic | Workflow | Children: WorkflowActivity[] |
| UserActivity | WorkflowActivity | Children: Step[] → Card[] |
| (none) | Step | New layer between activity and card |
| Card | Card | +step_id, +build_state; -testFileIds, -codeFileIds |
| ContextDoc | ContextArtifact | Expanded type enum; +uri, +locator, +integration_ref |
| KnownFact | CardKnownFact | +status, +source, +confidence, +position |
| Assumption | CardAssumption | Same enrichment |
| Question | CardQuestion | Same enrichment |
| requirements: string[] | CardRequirement[] | Structured with status/source/confidence |
| (none) | CardPlannedFile | New: MVP architecture checkpoint artifact |

### Exit Criteria

- `components/dossier/types.ts` deleted or UI-only helpers
- `lib/map-adapter.ts` deleted
- All 13 components compile with canonical types
- Page refresh retains state
- Card expansion shows planned files, knowledge items with status
- All component smoke tests pass

---

## 2. Mutation Pipeline Hardening

**Parent refs:** `prototype_to_functional_mvp` Step 6 · Strategy §Phase 3

### Problem

`POST /api/projects/[id]/actions` iterates actions sequentially with no Postgres transaction. No preview endpoint. No idempotency. No action log reconstruction. No concurrent submission handling.

### Tasks

| ID | Task | Details | Status |
|----|------|---------|--------|
| 6a | Server-side consolidation | `lib/supabase/mutations.ts` as single entry point. Add `pipelineApply(supabase, projectId, actions[])`. | ✅ Done |
| 6b | Transactional apply | Use `pg` dependency for direct transaction control. Rollback all on any failure. | ⏸ Deferred (requires stored proc or porting mutations to raw SQL) |
| 6c | Preview endpoint | `POST /api/projects/[id]/actions/preview` — dry-run, returns delta without writing. | ✅ Done |
| 6d | Idempotency keys | Add `idempotency_key` column + unique index on `planning_action`. Check before processing. | ✅ Done |
| 6e | Action history reconstruction | `lib/actions/reconstruct-state.ts` — replay accepted PlanningActions onto empty state. Drift detection. | ✅ Done |
| 6f | Concurrent safety | `action_sequence INT` on project table. Reject on mismatch, increment on success. | ✅ Done |
| 6g | Integration tests | Batch transaction, rollback, preview/apply match, idempotency, concurrent submission, state reconstruction. | ✅ Done |

### Exit Criteria

- [x] Preview/apply mismatch rate = 0% (preview endpoint + applyActionBatch)
- [x] Idempotency prevents duplicate processing
- [x] State reconstructable from action log
- [x] Concurrent submissions resolve safely (action_sequence)
- [ ] All state mutations are transactional (6b deferred)

---

## 3. Realtime Sync

**Parent refs:** `prototype_to_functional_mvp` Step 7 · Strategy §Phase 4

### Problem

No realtime subscriptions exist. Every change requires explicit `fetchMap()` or page refresh. No optimistic updates. No multi-client convergence.

### Tasks

| ID | Task | Details |
|----|------|---------|
| 7a | Enable Realtime | Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE card, workflow_activity, step, workflow, planning_action, orchestration_run;` |
| 7b | Realtime hooks | `lib/realtime/` — useRealtimeMap (entity changes), useRealtimeActions (accepted action feed), useRealtimeRuns (run status). |
| 7c | Optimistic updates | Apply expected delta immediately on submit. Rollback on server rejection. |
| 7d | Sequence tracking | Track lastKnownTimestamp per entity. Skip stale events. Full refresh if too far out of order. |
| 7e | Reconnect handling | Disconnect indicator → full state rehydration on reconnect → clear optimistic deltas. |
| 7f | Convergence tests | Mock Realtime channel. Simulate postgres_changes events. Verify state convergence and rollback. |

### Exit Criteria

- Updates propagate within 1 second
- Two clients converge under concurrent edits
- Reconnect rehydrates reliably
- Optimistic updates roll back on rejection

---

## 4. Memory Plane (RuVector)

**Parent refs:** `dual-llm-integration` Phase 3 · `ruvector-orchestration-plan` · Strategy §Memory and Retrieval

### Problem

Schema defined in strategy doc (MemoryUnit, MemoryUnitRelation, MemoryRetrievalLog) but nothing implemented. No Postgres tables, no RuVector client, no ingestion, no retrieval, no historical snapshots.

### Tasks

| ID | Task | Details |
|----|------|---------|
| M1 | RuVector assessment | Map RuVector APIs to needs. Evaluate embedded Node vs standalone. Decide memory-only vs full orchestration. Update strategy doc. |
| M2 | MemoryStore adapter | `lib/memory/` — MemoryStore interface (insert, search, update, delete), RuVector adapter, mock adapter for tests. |
| M3 | Postgres tables | Migration for memory_unit, memory_unit_relation, memory_retrieval_log with constraints and indexes. |
| M4 | Ingestion pipeline | `lib/memory/ingestion.ts` — convert card + context artifacts + approved knowledge to MemoryUnit entries. Trigger on approval events and build triggers. |
| M5 | Retrieval policy | `lib/memory/retrieval.ts` — card-scoped approved first → project-scoped → draft if allowed → never rejected. Log retrieval. |
| M6 | Historical snapshots | `lib/memory/snapshots.ts` — append-only to RuVector on status transitions, approval, build trigger. Async, never blocks Postgres. |
| M7 | Orchestration wiring | In create-assignment.ts: call retrieveCardContext, include memory refs in assignment_input_snapshot. |
| M8 | Memory tests | Adapter contract, ingestion, retrieval ranking, snapshot pipeline, knowledge filtering. |

### Fallback

If RuVector unavailable: mock adapter for dev, Postgres pgvector as fallback. Adapter interface ensures swap is non-breaking.

### Exit Criteria

- Card context ingested into memory on approval/build events
- Retrieval returns card-scoped approved units first
- Historical snapshots captured on key events
- Orchestration assignments include retrieved memory context
- Rejected items never appear in retrieval

---

## 5. Orchestration Execution Integration

**Parent refs:** `dual-llm-integration` Phase 4-5 · `prototype_to_functional_mvp` Step 9 completion · Strategy §Orchestration Flow

### Problem

Step 9 foundation is complete (schemas, API, service layer, validation). But: webhook is a 202 stub, checks record everything as "passed" (dry-run), no agentic-flow client, no build trigger in UI, no run status UI, no approval controls, no EventLog writes.

### Tasks

| ID | Task | Details |
|----|------|---------|
| O1 | Agentic-flow client | `lib/orchestration/agentic-flow-client.ts` — AgenticFlowClient interface with dispatch, status, cancel. HTTP client to AGENTIC_FLOW_URL. Mock client for dev. |
| O2 | Execution dispatch | `lib/orchestration/dispatch.ts` — fetch assignment + card + planned files, retrieve memory, build payload, dispatch, create AgentExecution, update status, log event. |
| O3 | Webhook processing | Replace stub. Handle: execution_started, commit_created, execution_completed, execution_failed. Update records, trigger checks on completion. |
| O4 | Real check execution | Hybrid: basic checks (lint, unit) direct against worktree; complex checks (integration, e2e, security) delegated to agentic-flow. |
| O5 | Build trigger UI | Per-card Build button (visible when approved planned files exist). Header Build All for workflow scope. Both call POST orchestration/runs. |
| O6 | Run status UI | Runs tab in right panel. List runs with status badges. Expand: per-card assignments, agent logs, check results, commits. Memory trace tab. |
| O7 | Approval controls UI | Approve PR Creation / Approve Merge buttons. Retry on failures. Reassign card to different agent profile. |
| O8 | EventLog wiring | `lib/orchestration/event-logger.ts` — write to event_log for planning_action_applied, memory_committed, agent_run_started, checks_executed, approval_requested, pr_created. |
| O9 | Integration tests | Dispatch with mock agentic-flow, webhook processing, check execution, full lifecycle, event logging, retry flow. |

### External Dependency

Agentic-flow service must be available for real dispatch. Use mock client until ready.

### Exit Criteria

- Full lifecycle: trigger → run → assignment → dispatch → checks → approval → PR
- All events logged to event_log
- Build button appears only when preconditions met
- Run status visible in UI
- No run can request approval without required checks

---

## 6. Hardening & Go-Live

**Parent refs:** `prototype_to_functional_mvp` Step 10 · `dual-llm-integration` Phase 6 · Strategy §Phase 7

### Problem

Placeholder E2E tests. One feature flag. No auth/RLS (required by ADR-0007). No Sentry. N+1 queries in map snapshot. No error boundaries or loading skeletons.

### Tasks

| ID | Task | Details |
|----|------|---------|
| 10a | E2E planning flow | Stagehand: create project → chat → preview → accept → verify map → refresh → verify persistence. |
| 10b | E2E build flow | Stagehand: approve planned file → Build → verify run → checks → approval → PR candidate. |
| 10c | E2E realtime | Stagehand: two browser contexts, concurrent edits, verify convergence within 2 seconds. |
| 10d | Error boundaries | MapErrorBoundary, ChatErrorBoundary, generic ErrorBoundary. User-facing messages for network/validation/auth/server errors. |
| 10e | Loading states | MapSkeleton, CardSkeleton, ChatSkeleton, RunStatusSkeleton replacing text-only indicators. |
| 10f | Feature flags | `lib/feature-flags.ts` — PLANNING_LLM, BUILD_ORCHESTRATOR, REALTIME_SYNC, MEMORY_PLANE. Gate behavior per flag. |
| 10g | Auth + RLS | Supabase Auth (email/password). RLS on all tables. created_by columns. Auth tokens in client. **Non-negotiable per ADR-0007.** |
| 10h | Security audit | Zod on all inputs, no secrets in responses, RLS active, CORS configured, rate limiting, immutable snapshots verified. |
| 10i | Performance | Batch queries in fetchMapSnapshot (fix N+1), nested Supabase selects, short TTL cache, paginate actions and runs. |
| 10j | Monitoring | Sentry SDK + source maps, breadcrumbs, Vercel Analytics, rejection/rollback dashboards. |
| 10k | Go-live gate | Must-pass: E2E flows, auth, security, flags, error boundaries, Sentry. Should-pass: realtime E2E, N+1 fixed, loading states. |

### Items That Can Start Independently

These don't depend on other work groups completing first:
- 10d Error boundaries
- 10e Loading states
- 10f Feature flags
- 10g Auth + RLS
- 10i Performance (N+1 fix)
- 10j Monitoring (Sentry)

### Exit Criteria

- E2E tests cover idea → map → build → approval flow
- Auth enabled, RLS active on all tables
- No critical security issues
- Feature flags control progressive rollout
- Sentry configured and receiving events
- Map snapshot optimized (no N+1)
