---
document_id: plan.hosted-multi-user
last_verified: 2026-03-06
tokens_estimate: 500
ttl_expires_on: 2026-04-06
tags:
  - feature-plan
  - scaling
  - infrastructure
---
# Feature: Hosted Multi-User Architecture

**Status**: Proposed
**Target**: TBD
**User Stories**: N/A

## Problem
Dossier is currently a single-user desktop app (Electron + local SQLite + in-process agents). This limits it to one person on one machine. Scaling to concurrent users, teams, or cloud hosting requires replacing the storage and compute layers.

## Solution

### Database Migration: SQLite → Postgres
- Replace local SQLite with hosted Postgres (Supabase or equivalent)
- Migrate DbAdapter implementation; keep the adapter interface unchanged
- Add RLS policies for multi-user data isolation
- Add authentication layer (Supabase Auth or equivalent)

### Two-Service Architecture
- **Service 1 (Dossier)**: Deploy Next.js app to Vercel or similar serverless platform
  - Frontend + planning API (stateless, short-lived requests)
- **Service 2 (Execution host)**: Deploy build agents to a dedicated host (Railway / Fly.io)
  - Long-lived agent processes, filesystem access, persistent disk for RuVector
  - Communication via MCP over HTTP (dispatch, status poll, cancel)
  - Persistent volume: `/data/ruvector/` (vectors, indexes) + `/data/repo/` (git checkouts)

### Real-Time Sync (Multi-Client)
- Event transport for accepted action deltas and run status updates
- Ordering/version controls for concurrent edits
- Reconnect/resubscribe rehydration

### Auth and RLS
- Authentication required for all API routes
- Row-level security on all project-scoped data
- Per-user project ownership and access control

## Impact
- Files: `lib/db/`, `middleware.ts`, deployment config, new Postgres adapter
- Breaking changes: Yes (storage backend, auth required)
- Migration: Yes (SQLite → Postgres data migration needed)

## Risks
- Serverless constraints incompatible with long-lived agent processes (mitigated by two-service split)
- Migration complexity for existing local data
- Real-time sync adds conflict resolution complexity

## Acceptance Criteria
- [ ] Postgres adapter passes all existing DbAdapter tests
- [ ] Auth middleware protects all API routes
- [ ] RLS policies enforce project-scoped data isolation
- [ ] Two clients converge to identical map state under concurrent edits
- [ ] Build agents run on dedicated host with persistent volume
