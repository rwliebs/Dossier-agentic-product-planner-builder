---
document_id: doc.system-architecture
last_verified: 2026-02-18
tokens_estimate: 1200
tags:
  - architecture
  - system
  - overview
anchors:
  - id: overview
    summary: "Self-deployable Next.js app; SQLite + claude-flow + RuVector"
  - id: data-flow
    summary: "Planning LLM → actions → DbAdapter; Build → orchestration → agents"
  - id: endpoints
    summary: "REST API under /api/projects; map, actions, artifacts, cards"
  - id: boundaries
    summary: "Planning vs Build Orchestrator; no code-gen from planning"
ttl_expires_on: null
---
# System Architecture Reference

**Anchors**: [data-contracts-reference.md#contract](#), [user-workflows-reference.md](#)

## Contract

### Invariants
- INVARIANT: All map mutations flow through `POST /api/projects/[id]/actions`; no direct DB writes from UI
- INVARIANT: Planning LLM never generates production code or triggers builds
- INVARIANT: Build Orchestrator never auto-merges to main; PR lifecycle is user-gated

### Boundaries
- ALLOWED: Planning LLM creates workflows, activities, steps, cards; proposes planned files; links context
- FORBIDDEN: Planning LLM writes to GitHub, creates real files, triggers code execution

---

## Overview

**Self-deployable now. Hostable later. Single-user now. Collaborative later.**

```
┌──────────────────────────────────────────────────────┐
│  Developer's Machine                                  │
│                                                       │
│  ┌────────────┐  ┌───────────┐  ┌────────────────┐   │
│  │  Next.js   │  │  SQLite   │  │  claude-flow   │   │
│  │  (UI +     │──│  (single  │  │  (in-process   │   │
│  │   API)     │  │   file)   │  │   agents)      │   │
│  └──────┬─────┘  └───────────┘  └───────┬────────┘   │
│         │                               │             │
│         │        ┌───────────┐          │             │
│         │        │  RuVector │          │             │
│         │        │  (local   │──────────┘             │
│         │        │   WASM)   │                        │
│         │        └───────────┘                        │
│         ▼                                             │
│  ┌──────────────┐                                     │
│  │  Local Git   │──── push ────▶ GitHub               │
│  │  Repo        │                                     │
│  └──────────────┘                                     │
└──────────────────────────────────────────────────────┘
         │
         ▼
   Anthropic API (planning LLM)
```

| Component | Technology | Path |
|-----------|------------|------|
| UI + API | Next.js (React 19) | `app/` |
| Database | SQLite (better-sqlite3) | `~/.dossier/dossier.db` |
| DB abstraction | `DbAdapter` | `lib/db/adapter.ts` |
| Planning LLM | Anthropic Claude | `lib/llm/` |
| Build agents | claude-flow (in-process) | TBD |
| Embeddings | RuVector (local WASM) | TBD |

---

## Data Flow

### Planning Path
```
User chat → Planning LLM → stream-action-parser → PlanningAction[]
  → validate-action → apply-action → DbAdapter.transaction()
  → SQLite
```

### Map Snapshot Path
```
GET /api/projects/[id]/map → DbAdapter queries → build map tree
  → Project + Workflow[] + Activity[] + Step[] + Card[]
```

### Build Path (future)
```
User trigger → OrchestrationRun → CardAssignment[] → claude-flow
  → RuVector memory → agents → RunCheck[] → ApprovalRequest → PR
```

---

## API Endpoints Summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/[id]` | Get project |
| GET | `/api/projects/[id]/map` | Canonical map snapshot |
| POST | `/api/projects/[id]/actions` | Submit planning actions |
| GET | `/api/projects/[id]/chat` | Chat (non-streaming) |
| POST | `/api/projects/[id]/chat/stream` | Chat (streaming) |
| GET | `/api/projects/[id]/artifacts` | List context artifacts |
| GET | `/api/projects/[id]/cards/[cardId]/requirements` | Card requirements |
| GET | `/api/projects/[id]/cards/[cardId]/planned-files` | Card planned files |

Full API reference: [reference/api-endpoints.md](reference/api-endpoints.md)

---

## Key Directories

| Path | Purpose |
|------|---------|
| `lib/schemas/` | Zod schemas (slice-a, slice-b, slice-c, action-payloads) |
| `lib/actions/` | validate-action, apply-action, preview-action |
| `lib/db/` | DbAdapter, sqlite-adapter, migrate |
| `lib/llm/` | planning-prompt, stream-action-parser |
| `lib/orchestration/` | create-run, dispatch, execute-checks, approval-gates |
| `lib/memory/` | ingestion, retrieval, harvest |
| `app/api/projects/` | Route handlers |

## Domain Overviews

| Domain | Doc | Purpose |
|--------|-----|---------|
| Planning | [planning-reference](domains/planning-reference.md) | LLM, prompts, stream parser, chat modes |
| Mutation | [mutation-reference](domains/mutation-reference.md) | Actions pipeline, validate, apply |
| Map | [map-reference](domains/map-reference.md) | Snapshot, tree build, PlanningState |
| Orchestration | [orchestration-reference](domains/orchestration-reference.md) | Runs, assignments, checks, PR |
| Memory | [memory-reference](domains/memory-reference.md) | RuVector, ingestion, retrieval, harvest |

## Subfolders

| Folder | Contents |
|--------|----------|
| [domains/](domains/) | Domain references (data contracts, API, planning, mutation, map, orchestration, memory) |
| [product/](product/) | User personas, stories, workflows |
| [reference/](reference/) | API endpoints, memory coordination prompt |
| [strategy/](strategy/) | Dual LLM strategy, worktree management |
| [plans/](plans/) | Remaining work plan |
| [investigations/](investigations/) | Investigations (TTL: 2 weeks) |
| [adr/](adr/) | Architecture Decision Records |

---

## Verification
- [ ] DbAdapter is single seam for persistence
- [ ] All map mutations go through actions pipeline
- [ ] Planning vs Build boundaries enforced in prompts and validation

## Related
- [strategy/dual-llm-integration-strategy.md](strategy/dual-llm-integration-strategy.md)
- [domains/data-contracts-reference.md](domains/data-contracts-reference.md)
- [product/user-workflows-reference.md](product/user-workflows-reference.md)
