# API Endpoints Reference

REST API for the Dossier planning/build system. All routes are under `/api`.

## Base URL

- Local: `http://localhost:3000`
- All endpoints: `/api/...`

## Error Shapes (As Built)

Most routes use the shared error helper:

```json
{
  "error": "validation_failed|not_found|conflict|action_rejected|internal_error",
  "message": "Human-readable description",
  "details": { "field": ["specific issue"] }
}
```

Some orchestration/setup/repo utility routes return simpler JSON like:

```json
{ "error": "message string" }
```

Common statuses in current handlers: `400`, `401`, `404`, `409`, `422`, `500`, `502`, `503`.

---

## Setup & Environment

### GET /api/setup/status

Returns setup readiness for Anthropic planning credentials and GitHub token.

**Response (`200`):**
```json
{
  "needsSetup": true,
  "missingKeys": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"],
  "configPath": "/home/<user>/.dossier/config",
  "anthropicViaCli": false
}
```

Notes:
- Anthropic is considered satisfied when either:
  - `ANTHROPIC_API_KEY` resolves from env or `~/.dossier/config`, or
  - Claude CLI is installed/authenticated (`anthropicViaCli: true`).
- `GITHUB_TOKEN` is still required for push/sync flows.

### POST /api/setup

Saves one or both keys to `~/.dossier/config` and injects saved values into `process.env` for immediate use.

**Request body:**
```json
{
  "anthropicApiKey": "sk-ant-... (optional)",
  "githubToken": "ghp_... (optional)"
}
```

**Constraints:**
- At least one key is required (`400` otherwise).

---

## Project Management

### GET /api/projects
List projects.

### POST /api/projects
Create project + default system policy profile.

**Request body (subset):**
```json
{
  "name": "required",
  "repo_url": "https://github.com/org/repo (optional)",
  "default_branch": "main (optional)"
}
```

### GET /api/projects/[projectId]
Get project.

### PATCH /api/projects/[projectId]
Update mutable project fields (name/description/personas/tech/deployment/design/repo/default_branch).

**Constraint:** `finalized_at` is intentionally not writable through this endpoint.

---

## Planning Chat

### POST /api/projects/[projectId]/chat
Non-streaming planning endpoint.

**Modes:**
- `scaffold` -> scaffold prompt; only `updateProject` + `createWorkflow` are applied.
- `populate` (+ `workflow_id`) -> add activities/cards in one workflow.
- `finalize` -> generate required project-level context artifacts (multi-step finalize flow).
- omitted -> scaffold if map is empty, otherwise full planning mode.

**Request body:**
```json
{
  "message": "string",
  "mode": "scaffold|populate|finalize (optional)",
  "workflow_id": "uuid (required when mode=populate)",
  "mock_response": "test-only optional"
}
```

### POST /api/projects/[projectId]/chat/stream
SSE variant of planning endpoint.

**SSE events used by current handlers:**
- `message`
- `action`
- `error`
- `finalize_progress`
- `phase_complete`
- `done`

**Response type:** `text/event-stream`

---

## Map & Actions

### GET /api/projects/[projectId]/map
Canonical map snapshot (project -> workflows -> activities -> steps -> cards).

### GET /api/projects/[projectId]/actions
Project action history.

### POST /api/projects/[projectId]/actions
Validate + apply action batch.

### POST /api/projects/[projectId]/actions/preview
Dry-run preview; computes action summaries/deltas without DB writes.

---

## Context Artifacts

### GET /api/projects/[projectId]/artifacts
List project artifacts.

### POST /api/projects/[projectId]/artifacts
Create artifact. Requires at least one of: `content`, `uri`, `integration_ref`.

### GET /api/projects/[projectId]/artifacts/[artifactId]
Get artifact.

### PATCH /api/projects/[projectId]/artifacts/[artifactId]
Update artifact.

### DELETE /api/projects/[projectId]/artifacts/[artifactId]
Delete artifact (`204`).

---

## Card Approval / Finalization

### GET /api/projects/[projectId]/cards/[cardId]/finalize
Returns card finalization package:
- card
- project docs (`doc/spec/design`)
- linked card artifacts
- requirements
- planned files
- current `finalized_at`

### POST /api/projects/[projectId]/cards/[cardId]/finalize
SSE finalize flow for a single card.

Current step sequence:
1. Link project-wide docs to card
2. Generate card e2e test artifact (+ optional card-specific docs)
3. Stamp `card.finalized_at`
4. Attempt memory ingestion for the card (best-effort when memory plane enabled)

**Validation constraints (returns `400 validation_failed`):**
- Card must belong to project
- Card must not already be finalized
- Project must already be finalized
- Card must have at least one requirement
- Card must have at least one planned file/folder

---

## Card Knowledge Items

All routes verify the card belongs to the project.

### Requirements
- `GET|POST /api/projects/[projectId]/cards/[cardId]/requirements`
- `PATCH|DELETE /api/projects/[projectId]/cards/[cardId]/requirements/[itemId]`

### Facts
- `GET|POST /api/projects/[projectId]/cards/[cardId]/facts`
- `PATCH|DELETE /api/projects/[projectId]/cards/[cardId]/facts/[itemId]`

### Assumptions
- `GET|POST /api/projects/[projectId]/cards/[cardId]/assumptions`
- `PATCH|DELETE /api/projects/[projectId]/cards/[cardId]/assumptions/[itemId]`

### Questions
- `GET|POST /api/projects/[projectId]/cards/[cardId]/questions`
- `PATCH|DELETE /api/projects/[projectId]/cards/[cardId]/questions/[itemId]`

---

## Card Planned Files & Context Links

### Planned files
- `GET|POST /api/projects/[projectId]/cards/[cardId]/planned-files`
- `PATCH|DELETE /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]`

### Context links for a card
- `GET|POST /api/projects/[projectId]/cards/[cardId]/context-artifacts`

---

## Repo Views & Sync

### GET /api/projects/[projectId]/files
Unified file API:
- `source=planned` (default): card planned files tree
- `source=repo`: actual cloned repo tree (+ git status)
- `source=repo&content=1&path=...`: file content (`text/plain`)
- `source=repo&diff=1&path=...`: diff vs base (`text/x-diff`)

### GET /api/projects/[projectId]/cards/[cardId]/produced-files
Returns added/modified files detected for the card's completed assignment branch.

### POST /api/projects/[projectId]/cards/[cardId]/push
Pushes this card's feature branch to origin.

Common non-200s:
- `400`: repo not connected
- `401`: missing/invalid GitHub token
- `409`: no completed build for that card
- `502`: push failed upstream

### POST /api/projects/[projectId]/repo/sync
Sync local base branch (usually `main`) to `origin/<baseBranch>` in Dossier's clone.

Common non-200s:
- `400`: repo not connected
- `401`: auth/token issue
- `502`: git sync failure

---

## Orchestration Endpoints (Build Runs)

See `app/api/projects/[projectId]/orchestration/**` for full route set, including:
- build trigger
- run/assignment/check lifecycle
- approvals
- PR candidate endpoints
- webhook ingestion

Primary domain doc: `docs/domains/orchestration-reference.md`.

---

## As-Built Notes

- **Mutations**: Map edits are mediated via action pipeline (`/actions`) or planning chat routes that internally apply validated actions.
- **Auth model**: Single-user local app; no user auth/RLS layer in API routes.
- **Database runtime**: SQLite is implemented; `DB_DRIVER=postgres` currently throws "not yet implemented."
