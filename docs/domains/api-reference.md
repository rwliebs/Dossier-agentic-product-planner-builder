---
document_id: doc.api-reference
last_verified: 2026-03-16
tokens_estimate: 400
tags:
  - api
  - endpoints
anchors:
  - id: endpoints
    summary: "REST API under /api; setup, projects, cards, orchestration, integrations"
ttl_expires_on: null
---
# API Reference

**Full reference**: [api-endpoints.md](../reference/api-endpoints.md)

## Contract

- INVARIANT: All routes are under `/api`; project-scoped routes use `[projectId]`
- INVARIANT: Most routes use `{ error, message, details? }`, but setup/integration/SSE routes may use endpoint-specific envelopes
- INVARIANT: Streaming endpoints use `text/event-stream` and emit terminal `done` events

## Endpoint Groups

| Group | Base Path | Purpose |
|-------|-----------|---------|
| Setup | `/api/setup`, `/api/setup/status` | Configure required runtime keys and inspect readiness |
| Docs panel | `/api/docs` | List docs index entries and retrieve doc content |
| GitHub integration | `/api/github/repos` | List or create repos using configured token |
| Projects | `/api/projects` | CRUD projects |
| Map | `/api/projects/[id]/map` | Canonical map snapshot |
| Actions | `/api/projects/[id]/actions` | Submit planning actions |
| Action preview | `/api/projects/[id]/actions/preview` | Dry-run action batch without mutation |
| Chat | `/api/projects/[id]/chat`, `/chat/stream` | Planning LLM |
| Memory | `/api/projects/[id]/memory` | Inspect stored memory units for a project |
| Artifacts | `/api/projects/[id]/artifacts` | Context artifacts |
| Card knowledge | `/api/projects/[id]/cards/[cardId]/{requirements,facts,assumptions,questions}` | Knowledge items |
| Planned files | `/api/projects/[id]/cards/[cardId]/planned-files` | Card planned files |
| Card finalize/build support | `/api/projects/[id]/cards/[cardId]/{context-artifacts,produced-files,finalize,push}` | Context links, generated files, finalize flow, branch push |
| Files | `/api/projects/[id]/files` | File tree (planned or repo); `?source=repo` for produced code |
| Orchestration | `/api/projects/[id]/orchestration/*` | Build triggers, runs, checks, assignments, approvals, PR candidates |

## Related
- [data-contracts-reference.md](data-contracts-reference.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
