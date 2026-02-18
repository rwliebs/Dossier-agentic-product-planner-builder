# Remaining Work Plan

> Generated 2026-02-17 from gap analysis against `dual-llm-integration` and `prototype_to_functional_mvp` plans.
> Updated 2026-02-18: Architecture pivoted to **self-deployable local-first model**. Supabase replaced by database abstraction (SQLite for self-deploy, Postgres for future hosted). claude-flow runs locally as in-process agent runtime. No cloud infrastructure required for MVP. Multi-user collaboration deferred to V2. See conversation record for strategic rationale.

## Architecture Model

**Self-deployable now. Hostable later. Single-user now. Collaborative later.**

Dossier runs as a standalone Next.js application on the developer's machine. All data stays local. Agents operate directly on the local repo. The only external dependency is an Anthropic API key for the planning LLM.

```
┌──────────────────────────────────────────────────────┐
│  Developer's Machine                                 │
│                                                      │
│  ┌────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │  Next.js   │  │  SQLite   │  │  claude-flow   │  │
│  │  (UI +     │──│  (single  │  │  (in-process   │  │
│  │   API)     │  │   file)   │  │   agents)      │  │
│  └──────┬─────┘  └───────────┘  └───────┬────────┘  │
│         │                               │            │
│         │        ┌───────────┐          │            │
│         │        │  RuVector │          │            │
│         │        │  (local   │──────────┘            │
│         │        │   WASM)   │                       │
│         │        └───────────┘                       │
│         │                                            │
│         ▼                                            │
│  ┌──────────────┐                                    │
│  │  Local Git   │──── push ────▶ GitHub              │
│  │  Repo        │                                    │
│  └──────────────┘                                    │
└──────────────────────────────────────────────────────┘
         │
         ▼
   Anthropic API (planning LLM)
```

**Future hosted mode:** Swap `DB_DRIVER=sqlite` → `DB_DRIVER=postgres`, deploy to any Node.js host, add auth middleware. Same codebase, different config. The `DbAdapter` interface is the seam.

## Status Summary

| # | Work Group | Status | Est. Days | Can Start Now |
|---|-----------|--------|-----------|---------------|
| 1 | Frontend Canonical Migration | Done | 4-5 | Yes |
| 2 | Mutation Pipeline Hardening | Mostly done (6/7 tasks) | 0.5 | Yes |
| **3** | **Database Abstraction Layer** | **Done** | **2-3** | **Yes** |
| 4 | Memory Plane (RuVector local) | In progress (M1–M3, M2 done) | 3-4 | Yes |
| 5 | Orchestration Execution (local claude-flow) | In progress (5/9 backend done) | 1-2 | Yes |
| 6 | Hardening & Go-Live | Not started | 2-3 | Partially |
| **7** | **Distribution & Packaging** | **Not started** | **1** | **Yes** |

**Total estimated: 8-11 days parallel, 14-18 days sequential.**

## What Is Already Done

- Phase 0: Strategy doc + full canonical schema (`DUAL_LLM_INTEGRATION_STRATEGY.md`)
- Step 2: Canonical Zod schemas, action validation, mutation logic (`lib/schemas/`, `lib/actions/`)
- Step 3: Supabase tables for Slice A/B/C, client setup, 10 SQL migration files (~1200 lines of DDL)
- Step 4: Full API layer — 32 route files under `app/api/projects/`
- Step 6 (mostly): Mutation pipeline — consolidation, preview, idempotency, reconstruction, concurrent safety, integration tests (6b transactional apply deferred)
- Step 8: Planning LLM — Claude client, prompt, parser, chat endpoint, preview UI
- Step 9 foundation: Orchestration schemas, API, service layer, approval gates
- Step 9 execution (partial): Client interface (mock + HTTP), dispatch logic, webhook processing, event logger, trigger-build orchestrator, 13 API routes

## What Changed (Self-Deploy Pivot)

| Previous (Web Service) | Now (Self-Deployable) | Impact |
|---|---|---|
| Supabase (hosted Postgres + REST API) | SQLite local file via `DbAdapter` | New work group (Section 3) |
| Vercel deployment | `next build --standalone` + CLI | New work group (Section 7) |
| claude-flow on Railway/Fly.io | claude-flow in-process on local machine | O10 simplified dramatically |
| MCP over HTTP to remote host | Direct programmatic import | No adapter gap, no polling bridge |
| Supabase Realtime subscriptions | **Removed from MVP** | Section 3 (old) eliminated entirely |
| Auth + RLS (non-negotiable) | **Deferred to V2** (single local user) | Section 6 simplified |
| Webhook auth (HMAC) | Not needed (in-process) | O11 eliminated |
| Worktree provisioning | Not needed (agents work in local repo) | O12 stays deferred |
| Deploy claude-flow infrastructure | Not needed | Track C eliminated |

## Parallelism

```
Track A (Frontend):    [1. Canonical Migration] ──────────────────────────┐
                                                                          │
Track B (Data):        [3. DB Abstraction Layer] ──> [API route refactor] ┤
                                                                          │
Track C (Backend):     [5. Orchestration + local agent client]            ├──> [6. Hardening]
                              │                                           │        │
                       [4. Memory Plane (local RuVector)]  ───────────────┘        │
                                                                                   ▼
Track D (Independent): [7. Distribution & Packaging]                         [Go-Live]
                       [Error Boundaries] [Feature Flags] [Loading States]
```

Tracks A through D can start in parallel. No cloud infrastructure deployment is required to unblock any track.

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

**Status: 6/7 tasks complete. 6b (transactional apply) becomes trivial with SQLite.**

### Problem

Action pipeline applies sequentially with no database transaction. Preview, idempotency, reconstruction, and concurrent safety are all complete. Transactional apply was deferred because Supabase required stored procedures or raw SQL.

### Tasks

| ID | Task | Details | Status |
|----|------|---------|--------|
| 6a | Server-side consolidation | `lib/supabase/mutations.ts` as single entry point. `pipelineApply()`. | ✅ Done |
| 6b | Transactional apply | Wrap `pipelineApply` in a SQLite/Postgres transaction via `DbAdapter.transaction()`. Rollback all on any failure. | ⏳ Unblocked by Section 3 |
| 6c | Preview endpoint | `POST /api/projects/[id]/actions/preview` — dry-run, returns delta without writing. | ✅ Done |
| 6d | Idempotency keys | `idempotency_key` column + unique index on `planning_action`. | ✅ Done |
| 6e | Action history reconstruction | `lib/actions/reconstruct-state.ts` — replay accepted PlanningActions onto empty state. | ✅ Done |
| 6f | Concurrent safety | `action_sequence INT` on project table. Reject on mismatch, increment on success. | ✅ Done (retained for future multi-user; low cost) |
| 6g | Integration tests | All pipeline scenarios. | ✅ Done |

### Exit Criteria

- [x] Preview/apply mismatch rate = 0%
- [x] Idempotency prevents duplicate processing
- [x] State reconstructable from action log
- [x] Concurrent submissions resolve safely
- [ ] All state mutations are transactional (6b — unblocked once DbAdapter lands)

---

## 3. Database Abstraction Layer (NEW)

### Problem

All data access goes through the Supabase SDK (`supabase.from().select().eq()`). This couples the app to Supabase cloud and prevents local/self-hosted deployment. The actual query patterns are simple CRUD — no Supabase-specific features are used (no RLS, no realtime, no storage buckets, no edge functions).

### Coupling Surface

| File | `.from()` calls | Role |
|------|----------------|------|
| `lib/supabase/queries/orchestration.ts` | ~14 | Orchestration CRUD (runs, assignments, checks, approvals) |
| `lib/supabase/mutations.ts` | ~8 | Action pipeline apply |
| `lib/supabase/map-snapshot.ts` | ~6 | Story map tree fetch |
| `lib/supabase/persist-planning-state.ts` | ~4 | Upsert planning entities |
| API route inline calls | ~5 | Direct inserts/updates in route handlers |
| `lib/supabase/queries/{projects,workflows,cards,actions}.ts` | 0 | Stubs — `throw new Error("Not implemented")` |

Total: ~37 Supabase SDK calls to replace.

### Tasks

| ID | Task | Details |
|----|------|---------|
| D1 | Define `DbAdapter` interface | `lib/db/adapter.ts` — typed interface covering all query/mutation methods currently scattered across `queries/`, `mutations.ts`, `map-snapshot.ts`, `persist-planning-state.ts`. Methods grouped by domain (projects, workflows, cards, actions, orchestration, memory). Include `transaction(fn)` method for 6b. |
| D2 | SQLite adapter | `lib/db/sqlite-adapter.ts` — implement `DbAdapter` using `better-sqlite3`. Port 10 Postgres migration files (~1200 lines) to SQLite-compatible DDL (enums → CHECK constraints, `gen_random_uuid()` → application-generated UUIDs, `timestamptz` → TEXT ISO-8601). |
| D3 | Postgres adapter (stub) | `lib/db/postgres-adapter.ts` — implement `DbAdapter` using the `postgres` package already in `package.json`. Re-use existing migration SQL directly. This is the future hosted-mode adapter. Can be a thin wrapper initially. |
| D4 | Adapter factory | `lib/db/index.ts` — reads `DB_DRIVER` env var (`sqlite` or `postgres`). Returns configured adapter. SQLite default. Auto-creates DB file and runs migrations on first access. |
| D5 | Refactor data access layer | Replace all `supabase.from()` calls in `mutations.ts`, `map-snapshot.ts`, `persist-planning-state.ts`, `queries/orchestration.ts` with `DbAdapter` method calls. Replace inline Supabase calls in API routes with adapter calls. |
| D6 | Refactor API routes | All 32 routes switch from `const supabase = await createClient()` to `const db = getDb()`. Mechanical find-and-replace. Zod validation and response helpers unchanged. |
| D7 | Port migrations to SQLite | Convert the 10 existing SQL migration files to SQLite-compatible schema. Key changes: Postgres enums → TEXT + CHECK, `gen_random_uuid()` → UUIDs generated in application code, `DO $$ BEGIN ... END $$` blocks → plain CREATE TABLE IF NOT EXISTS, `timestamptz` → TEXT. |
| D8 | Migration runner | Simple migration runner that tracks applied migrations in a `_migrations` table. Runs on app startup. Works for both SQLite and Postgres adapters. |
| D9 | Tests | Adapter contract tests: run identical test suite against both SQLite (in-memory) and Postgres (when `DATABASE_URL` set). Verify CRUD, transactions, constraint enforcement. |

### Design Principles

- The `DbAdapter` interface is the **only seam** between business logic and storage.
- API routes, mutation pipeline, orchestration logic — none of them import database-specific code.
- SQLite is the default. Postgres is opt-in via `DB_DRIVER=postgres` + `DATABASE_URL`.
- The interface uses canonical Zod types from `lib/schemas/` as input/output, not raw rows.

### Exit Criteria

- All 32 API routes work with SQLite (no Supabase dependency)
- `@supabase/ssr` and `@supabase/supabase-js` are dev-only dependencies (used only by Postgres adapter)
- App starts with zero config beyond `ANTHROPIC_API_KEY`
- Existing integration tests pass against SQLite in-memory adapter
- Postgres adapter passes same contract tests (CI with `DATABASE_URL`)

---

## 4. Memory Plane (Local RuVector)

**Parent refs:** `dual-llm-integration` Phase 3 · Strategy §Memory and Retrieval

### Problem

Schema defined in strategy doc (MemoryUnit, MemoryUnitRelation, MemoryRetrievalLog) but nothing implemented. No tables, no vector integration, no ingestion, no retrieval, no historical snapshots.

### Architecture (Self-Deploy Model)

RuVector runs **locally on the developer's machine** — either as embedded WASM or via native ARM64/x64 bindings (already available in `@ruvector/core`). No remote service, no MCP-over-HTTP for vector operations. Dossier imports RuVector directly.

Memory content lives in SQLite (via `DbAdapter`). Vector embeddings and GNN weights live in a local RuVector data directory (`~/.dossier/ruvector/` or `<project>/.dossier/ruvector/`).

The **seed → execute → harvest** lifecycle is preserved:
- **Seed**: Query RuVector locally for similar memory, fetch content from SQLite, inject into claude-flow's swarm context.
- **Execute**: Agents read/write shared memory during the build.
- **Harvest**: Post-build, extract durable learnings, generate embeddings locally, save content + `embedding_ref` to SQLite.

### Tasks

| ID | Task | Details |
|----|------|---------|
| M1 | RuVector local setup | Add `ruvector` to `package.json`. Configure data directory. Verify embedded mode starts (WASM or native). Test basic embed + search cycle. |
| M2 | MemoryStore adapter | `lib/memory/store.ts` — MemoryStore interface. Real adapter uses `DbAdapter` for content + RuVector for vectors. Mock adapter for tests returns empty results. |
| M3 | Database tables | Add `memory_unit`, `memory_unit_relation`, `memory_retrieval_log` to migration set (SQLite-compatible). Add corresponding methods to `DbAdapter`. |
| M4 | Ingestion pipeline | `lib/memory/ingestion.ts` — convert card + context artifacts + approved knowledge to MemoryUnit entries. Generate embedding via local RuVector. Save content to SQLite, vector to RuVector. Trigger on approval events and build triggers. |
| M4.5 | Build harvest pipeline | `lib/memory/harvest.ts` — post-build: read learnings from claude-flow swarm memory, filter for durable knowledge, run each through ingestion pipeline. Link to source card and project scope. |
| M5 | Retrieval policy | `lib/memory/retrieval.ts` — query RuVector locally for semantic matches → get `memory_unit_ids` → fetch content from SQLite. Card-scoped approved first → project-scoped → never rejected. Log retrieval. |
| M6 | Historical snapshots | `lib/memory/snapshots.ts` — append-only to RuVector on status transitions, approval, build completion. Async, never blocks SQLite writes. Include build outcome metadata for GNN learning. |
| M7 | Orchestration wiring | Replace `retrieveMemoryForCard()` placeholder in `dispatch.ts` with real retrieval (M5). Seed swarm memory pre-dispatch. Wire harvest (M4.5) into post-build callback on `execution_completed`. |
| M8 | Memory tests | Adapter contract, ingestion, retrieval ranking, snapshot pipeline, harvest cycle, knowledge filtering. Mock RuVector for unit tests. |

### Fallback

If RuVector unavailable or fails to initialize: mock adapter returns empty memory. Builds proceed without semantic memory context. Ingestion and harvest are no-ops. Retrieval falls back to exact card/project scoping from SQLite (non-semantic). Adapter interface ensures swap is non-breaking.

### Exit Criteria

- Card context ingested into memory on approval/build events
- Retrieval returns card-scoped approved units first (semantic via local RuVector)
- Historical snapshots captured on key events
- Orchestration assignments include retrieved memory context
- Rejected items never appear in retrieval
- Build N+1 can retrieve learnings from Build 1..N
- Works fully offline (no external embedding API)

---

## 5. Orchestration Execution (Local claude-flow)

**Parent refs:** `dual-llm-integration` Phase 4-5 · `prototype_to_functional_mvp` Step 9 completion · Strategy §Orchestration Flow

**Status: Backend service layer largely complete (O1-O3, O8 done). Client implementation and UI remain.**

### Architecture (Self-Deploy Model)

claude-flow runs **in-process** on the developer's machine. No remote host, no MCP-over-HTTP, no webhooks, no status polling. Dossier imports claude-flow's programmatic API directly and calls it as a library.

The `ClaudeFlowClient` interface (`dispatch`, `status`, `cancel`) is preserved — the implementation uses direct function calls when O10 lands. The mock client works for development.

Agents operate directly on the local git repo. No worktree provisioning needed. Branch creation, file writes, and commits happen on the local filesystem. PR creation uses the GitHub API via user-provided `GITHUB_TOKEN`.

### What's Done

- **O1 Client interface** (`lib/orchestration/claude-flow-client.ts`): `ClaudeFlowClient` interface with `dispatch`, `status`, `cancel`. Mock client.
- **O2 Execution dispatch** (`lib/orchestration/dispatch.ts`): Fetches assignment + card + planned files, retrieves memory (placeholder), builds payload, dispatches, creates `AgentExecution`, updates status, logs event.
- **O3 Webhook processing** (`lib/orchestration/process-webhook.ts`): Handles all 4 event types. Updates records, triggers checks on completion.
- **O8 EventLog wiring** (`lib/orchestration/event-logger.ts`): Writes to `event_log`.
- **Trigger-build orchestrator** (`lib/orchestration/trigger-build.ts`): Full lifecycle — create run, create assignments per card, dispatch each.
- **13 API routes** covering runs, assignments, dispatch, checks, approvals, PR candidates.
- **Partial integration tests** for mock client, webhook, event logger, dispatch.

### Remaining Tasks

| ID | Task | Details | Status |
|----|------|---------|--------|
| O1 | Client interface | `ClaudeFlowClient` interface preserved. Mock client works for dev. | ✅ Done |
| O2 | Execution dispatch | Full dispatch pipeline with event logging | ✅ Done |
| O3 | Webhook processing | All 4 event types handled, checks triggered | ✅ Done |
| O4 | Real check execution | Basic checks (lint, unit) run locally via spawn. Complex checks (integration, e2e, security) remain stubbed. | ✅ Done |
| O5 | Build trigger UI | Backend route exists. Needs: per-card Build button (visible when approved planned files exist). | ⏳ Partial |
| O6 | Run status UI | API routes exist. Needs: Runs tab in right panel with status badges, expandable assignments, agent logs, check results, commits. | ⏳ Partial |
| O7 | Approval controls UI | Backend complete. Needs: Approve PR Creation / Approve Merge buttons, retry on failures. | ⏳ Partial |
| O8 | EventLog wiring | All event types, used throughout orchestration flows | ✅ Done |
| O9 | Integration tests | Single-build lock, build-task, trigger-build tests added. Full lifecycle with local client deferred. | ✅ Done |
| O10 | **Local claude-flow client** | Replace mock in `claude-flow-client.ts` with direct programmatic import of claude-flow. Call `dispatch` → spawn local agent swarm, `status` → query in-process state, `cancel` → terminate swarm. | ❌ Not started |
| O10.5 | **Task description builder** | `lib/orchestration/build-task.ts` — translate `DispatchPayload` into claude-flow task description with planned files, constraints, acceptance criteria, and swarm agent workflow instructions. | ✅ Done |
| O10.6 | **Single-build lock** | Check for running `OrchestrationRun` in project before allowing new dispatch. UI shows "Build in progress" state. | ✅ Done |
| O13 | Env documentation | Add `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `DB_DRIVER` to `.env.example`. Document optional vars. | ✅ Done |

### Removed Tasks (Self-Deploy Pivot)

| ID | Task | Reason Removed |
|----|------|----------------|
| O10.7 | Status polling bridge | Not needed — claude-flow runs in-process, status is synchronous/callback-based |
| O11 | Webhook authentication | Not needed — no remote webhooks, all communication is in-process |
| O12 | Worktree provisioning | Deferred — agents work in local repo directly. Single-card builds only for MVP. |

### External Dependencies

- **claude-flow** — installed locally. Programmatic API for multi-agent swarm coordination.
- **RuVector** — embedded in claude-flow or imported directly. Local vector storage.
- **Local git repo** — agents read/write files and commit directly.
- **GitHub API** — for PR creation (requires `GITHUB_TOKEN`).
- **Anthropic API** — for agent LLM calls (requires `ANTHROPIC_API_KEY`).

### Exit Criteria

- Full lifecycle: trigger → seed memory → dispatch to local claude-flow → swarm executes → harvest memory → checks → approval → PR
- All events logged to event_log
- Build button appears only when preconditions met (approved planned files, no active build)
- Run status visible in UI
- No run can request approval without required checks
- Memory seeded before dispatch, harvested after completion
- Works with only `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` configured

---

## 6. Hardening & Go-Live

**Parent refs:** `prototype_to_functional_mvp` Step 10 · `dual-llm-integration` Phase 6 · Strategy §Phase 7

### Problem

Placeholder E2E tests. One feature flag. No error boundaries or loading skeletons. N+1 queries in map snapshot.

### Scope Change (Self-Deploy Pivot)

The following are **deferred to V2** (hosted/team mode):
- Auth + RLS (single local user — no authentication needed)
- Sentry / Vercel Analytics (local app — no cloud monitoring)
- CORS configuration (localhost only)
- Rate limiting (single user)
- E2E realtime convergence test (no multi-client)

The following are **simplified**:
- Security audit scope reduced (no RLS to verify, no remote API exposure)
- Performance concerns reduced (single user, local SQLite, no N+1 across network)

### Tasks

| ID | Task | Details |
|----|------|---------|
| 10a | E2E planning flow | Stagehand or Playwright: create project → chat → preview → accept → verify map → refresh → verify persistence. |
| 10b | E2E build flow | Stagehand or Playwright: approve planned file → Build → verify run → checks → approval → PR candidate. |
| 10d | Error boundaries | MapErrorBoundary, ChatErrorBoundary, generic ErrorBoundary. User-facing messages for validation/server errors. |
| 10e | Loading states | MapSkeleton, CardSkeleton, ChatSkeleton, RunStatusSkeleton replacing text-only indicators. |
| 10f | Feature flags | `lib/feature-flags.ts` — PLANNING_LLM, BUILD_ORCHESTRATOR, MEMORY_PLANE. Gate behavior per flag. |
| 10h | Security audit (lite) | Zod on all inputs, no secrets in responses, immutable run snapshots verified, API key stored safely (env var only, never logged). |
| 10i | Performance | Batch queries in fetchMapSnapshot (join-based instead of N+1 loops). SQLite makes this simpler (single process, no network). |
| 10k | Go-live gate | Must-pass: error boundaries, feature flags, security audit. Should-pass: E2E flows (often fragile), loading states, N+1 fixed. |

### Removed Tasks (Self-Deploy Pivot)

| ID | Task | Reason |
|----|------|--------|
| 10c | E2E realtime | No multi-client sync in MVP |
| 10g | Auth + RLS | Single local user, no authentication needed |
| 10j | Monitoring (Sentry/Analytics) | Local app, no cloud monitoring |

### Items That Can Start Independently

- 10d Error boundaries
- 10e Loading states
- 10f Feature flags

### Exit Criteria

- Error boundaries catch and display failures gracefully
- Feature flags control progressive feature rollout
- No API key or sensitive data leaks in responses or logs
- Map snapshot queries are batched (no N+1)
- (Should-pass) E2E tests cover idea → map → build → approval flow — useful but not blocking; E2E tests are often fragile

---

## 7. Distribution & Packaging (NEW)

### Problem

Dossier currently requires Supabase cloud + Vercel to run. For self-deploy, it needs to start with zero cloud infrastructure.

### Tasks

| ID | Task | Details |
|----|------|---------|
| P1 | Standalone build | Add `output: 'standalone'` to `next.config.mjs`. Verify the standalone build runs without Vercel. |
| P2 | CLI entry point | `bin/dossier.js` — starts the standalone Next.js server, auto-creates SQLite DB on first run, opens browser. Register as `bin` in `package.json`. |
| P3 | First-run setup | On first `npx dossier`, run migrations, create default project, print setup instructions (API key, GitHub token). |
| P4 | `.env.example` | Document all env vars: `ANTHROPIC_API_KEY` (required), `GITHUB_TOKEN` (required for PR creation), `DB_DRIVER` (default: sqlite), `DATABASE_URL` (optional, for Postgres mode), `DOSSIER_DATA_DIR` (default: `~/.dossier/`). |
| P5 | README update | Installation and quick-start instructions for self-deploy. `npx dossier` one-liner. |

### Exit Criteria

- `npx dossier` starts a working instance with zero prior setup (beyond API key)
- SQLite database created automatically on first run
- Migrations run automatically
- Browser opens to `http://localhost:3000`
- Works on macOS and Linux (Windows via WSL)

---

## Revised Timeline Comparison

| Work Group | Previous (Web Service) | Now (Self-Deploy) | Delta |
|---|---|---|---|
| Frontend Canonical Migration | 4-5 days | 4-5 days | — |
| Mutation Pipeline | 1 day | 0.5 days | Transactional apply trivial with SQLite |
| Realtime Sync | 3 days | **0 days** | Removed (single user) |
| DB Abstraction Layer | 0 days | **2-3 days** | New work (replaces Supabase) |
| Memory Plane | 5 days | 3-4 days | No remote host, no MCP-over-HTTP |
| Orchestration Execution | 4 days | 1-2 days | No adapter gap, no polling, no webhooks |
| Hardening & Go-Live | 7-8 days | 2-3 days | No auth, no RLS, no monitoring, no realtime E2E |
| Distribution & Packaging | 0 days | **1 day** | New work |
| **Infrastructure deployment** | **1-2 days** | **0 days** | No Railway/Fly.io setup |
| **Total (sequential)** | **24-30 days** | **14-18 days** | **~40% reduction** |
| **Total (parallel)** | **14-18 days** | **8-11 days** | **~40% reduction** |

## Future-Proofing Seams (V2 Hosted Mode)

These are the extension points that enable hosted/team deployment later without architectural changes:

| Seam | Self-Deploy (now) | Hosted (V2) |
|---|---|---|
| `DbAdapter` | SQLite | Postgres (Supabase, Neon, etc.) |
| `ClaudeFlowClient` | Local programmatic API | HTTP/MCP client (deferred) |
| Auth middleware | None (single user) | NextAuth, Supabase Auth, or Clerk |
| Realtime | Not needed | Supabase Realtime or Yjs/CRDT layer |
| Deployment | `npx dossier` / Tauri desktop | Vercel / Docker / any Node.js host |
| Monitoring | Console logs | Sentry + Vercel Analytics |
| Config switch | `DB_DRIVER=sqlite` | `DB_DRIVER=postgres` + `DATABASE_URL` |
