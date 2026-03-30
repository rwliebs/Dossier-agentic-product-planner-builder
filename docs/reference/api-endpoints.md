# API Endpoints Reference

REST API for the Dossier planning and build system. All routes under `/api`. SQLite (default) stores data in `~/.dossier/dossier.db`. Migrations run automatically on first use.

## Setup

1. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`.
2. Database: SQLite (default) stores data in `~/.dossier/dossier.db`. Migrations run automatically on first use.

## Base URL

- Local: `http://localhost:3000`
- All routes are under `/api`

## Error Response Format

All errors return JSON:

```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "details": { "field": ["specific issue"] }
}
```

| HTTP Status | Error Code       | When                                      |
|-------------|------------------|-------------------------------------------|
| 400         | validation_failed | Malformed payload, schema mismatch        |
| 404         | not_found        | Resource doesn't exist                    |
| 409         | conflict         | Referential integrity error               |
| 422         | action_rejected  | Action rejected (e.g. code-gen intent)    |
| 500         | internal_error   | Database or unexpected error              |

---

## Setup & Environment

### GET /api/setup/status

Return whether first-run setup is required.

**Response:** `200`
```json
{
  "needsSetup": true,
  "missingKeys": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"],
  "configPath": "/home/user/.dossier/config",
  "anthropicViaCli": false
}
```

Notes:
- `anthropicViaCli=true` means planning can run via installed Claude CLI even when API key is missing.
- Build orchestration still requires `ANTHROPIC_API_KEY`.

### POST /api/setup

Persist credentials to `~/.dossier/config`.

**Request body:**
```json
{
  "anthropicApiKey": "sk-ant-...",
  "githubToken": "ghp_..."
}
```

At least one key is required.

### GET /api/github/repos

List repositories visible to configured `GITHUB_TOKEN`.

### POST /api/github/repos

Create a GitHub repository for the authenticated user.

**Request body:**
```json
{
  "name": "my-repo",
  "private": true
}
```

---

## Project Management

### GET /api/projects

List all projects.

**Response:** `200` — Array of project objects

```json
[
  { "id": "uuid", "name": "string", "repo_url": "string|null", "default_branch": "string", "created_at": "string", "updated_at": "string" }
]
```

### POST /api/projects

Create a project.

**Request body:**
```json
{
  "name": "string (required)",
  "repo_url": "string|null (optional)",
  "default_branch": "string (optional, default: main)"
}
```

**Response:** `201` — Created project object

### GET /api/projects/[projectId]

Get project details.

**Response:** `200` — Project object | `404` — Not found

### PATCH /api/projects/[projectId]

Update project.

**Request body:** Same as POST, all fields optional

**Response:** `200` — Updated project object

---

## Map & Actions

### GET /api/projects/[projectId]/map

Canonical map snapshot: Workflow → WorkflowActivity → Step → Card tree.

**Response:** `200`
```json
{
  "project": { "id", "name", "repo_url", "default_branch" },
  "workflows": [
    {
      "id", "project_id", "title", "description", "build_state", "position",
      "activities": [
        {
          "id", "workflow_id", "title", "color", "position",
          "steps": [{ "id", "title", "position", "cards": [...] }],
          "cards": []
        }
      ]
    }
  ]
}
```

### GET /api/projects/[projectId]/actions

Action history for the project.

**Response:** `200` — Array of PlanningAction records

### POST /api/projects/[projectId]/actions

Submit planning actions. Validates, applies, and persists. Rejects on first failure.

**Request body:**
```json
{
  "actions": [
    {
      "id": "uuid (optional)",
      "action_type": "createWorkflow|createActivity|createStep|createCard|updateCard|reorderCard|linkContextArtifact|upsertCardPlannedFile|approveCardPlannedFile|upsertCardKnowledgeItem|setCardKnowledgeStatus",
      "target_ref": {},
      "payload": {}
    }
  ]
}
```

**Response:** `201` — `{ "applied": number, "results": [...] }` | `422` — Action rejected

**Supported action types:**

| Action | Description |
|--------|-------------|
| `createWorkflow` | Create a new workflow in the project |
| `createActivity` | Create a workflow activity |
| `createStep` | Create a step within an activity |
| `createCard` | Create a card in a step or activity |
| `updateCard` | Update card title, description, status, or priority |
| `reorderCard` | Move card to new step/position |
| `linkContextArtifact` | Link a context artifact to a card |
| `upsertCardPlannedFile` | Create or update a planned file for a card |
| `approveCardPlannedFile` | Approve or revert a planned file |
| `upsertCardKnowledgeItem` | Create or update a requirement, fact, assumption, or question |
| `setCardKnowledgeStatus` | Set status (draft/approved/rejected) on a knowledge item |

Code-generation intents are rejected.

### POST /api/projects/[projectId]/actions/preview

Dry-run action batch. Validates and returns previews without DB mutation.

**Response:** `200`
```json
{
  "success": true,
  "previews": [{ "summary": "Create workflow Checkout" }],
  "summary": ["Create workflow Checkout"]
}
```

---

## Context Artifacts

### GET /api/projects/[projectId]/artifacts

List project artifacts.

**Response:** `200` — Array of ContextArtifact

### POST /api/projects/[projectId]/artifacts

Create artifact. Requires at least one of: `content`, `uri`, `integration_ref`.

**Request body:**
```json
{
  "name": "string",
  "type": "doc|design|code|research|link|image|skill|mcp|cli|api|prompt|spec|runbook",
  "title": "string|null",
  "content": "string|null",
  "uri": "string|null",
  "locator": "string|null",
  "mime_type": "string|null",
  "integration_ref": "object|null"
}
```

**Response:** `201` — Created artifact

### GET /api/projects/[projectId]/artifacts/[artifactId]

Get single artifact.

### PATCH /api/projects/[projectId]/artifacts/[artifactId]

Update artifact. All fields optional.

### DELETE /api/projects/[projectId]/artifacts/[artifactId]

Delete artifact. **Response:** `204`

---

## Card Knowledge Items

All knowledge routes require the card to belong to the project (via workflow → activity).

### Requirements

- `GET /api/projects/[projectId]/cards/[cardId]/requirements`
- `POST /api/projects/[projectId]/cards/[cardId]/requirements`
- `PATCH /api/projects/[projectId]/cards/[cardId]/requirements/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/requirements/[itemId]`

### Facts

- `GET /api/projects/[projectId]/cards/[cardId]/facts`
- `POST /api/projects/[projectId]/cards/[cardId]/facts`
- `PATCH /api/projects/[projectId]/cards/[cardId]/facts/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/facts/[itemId]`

### Assumptions

- `GET /api/projects/[projectId]/cards/[cardId]/assumptions`
- `POST /api/projects/[projectId]/cards/[cardId]/assumptions`
- `PATCH /api/projects/[projectId]/cards/[cardId]/assumptions/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/assumptions/[itemId]`

### Questions

- `GET /api/projects/[projectId]/cards/[cardId]/questions`
- `POST /api/projects/[projectId]/cards/[cardId]/questions`
- `PATCH /api/projects/[projectId]/cards/[cardId]/questions/[itemId]`
- `DELETE /api/projects/[projectId]/cards/[cardId]/questions/[itemId]`

**Create payload (e.g. requirements):**
```json
{
  "text": "string",
  "status": "draft|approved|rejected (optional)",
  "source": "agent|user|imported",
  "confidence": "number 0-1 (optional)",
  "position": "number (optional)"
}
```

---

## Card Planned Files

### GET /api/projects/[projectId]/cards/[cardId]/planned-files

List planned files for a card.

### POST /api/projects/[projectId]/cards/[cardId]/planned-files

Create planned file.

**Request body:**
```json
{
  "logical_file_name": "string",
  "module_hint": "string|null",
  "artifact_kind": "component|endpoint|service|schema|hook|util|middleware|job|config",
  "action": "create|edit",
  "intent_summary": "string",
  "contract_notes": "string|null",
  "status": "proposed|user_edited|approved (optional)",
  "position": "number (optional)"
}
```

### PATCH /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]

Update or approve planned file. Use `{ "status": "approved" }` for approval.

### DELETE /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]

Delete planned file.

---

## Chat & Finalization

### POST /api/projects/[projectId]/chat

Non-streaming planning endpoint. Supports `scaffold`, `populate`, `finalize` modes.

**Request body:**
```json
{
  "message": "Create checkout workflow",
  "mode": "scaffold",
  "workflow_id": "uuid-when-populate"
}
```

### POST /api/projects/[projectId]/chat/stream

Streaming SSE planning endpoint. Emits action/progress events as planning runs.

### GET /api/projects/[projectId]/cards/[cardId]/finalize

Return card finalization package (card, project docs, linked artifacts, requirements, planned files).

### POST /api/projects/[projectId]/cards/[cardId]/finalize

Streaming SSE card finalization:
1. Links project docs to card
2. Generates e2e test context artifact
3. Sets `card.finalized_at`

Possible validation responses include:
- Project not finalized
- No card requirements
- No planned files

### GET /api/projects/[projectId]/cards/[cardId]/context-artifacts

List artifacts linked to a card.

### GET /api/projects/[projectId]/cards/[cardId]/produced-files

List files produced by the completed assignment for a card (`added|modified`).

---

## Build & Orchestration

### POST /api/projects/[projectId]/orchestration/build

Trigger build run for a workflow or single card.

**Request body:**
```json
{
  "scope": "card",
  "card_id": "uuid",
  "initiated_by": "user",
  "trigger_type": "manual"
}
```

**Response:** `202`
```json
{
  "runId": "uuid",
  "assignmentIds": ["uuid"],
  "message": "Build started",
  "outcome_type": "success"
}
```

### Runs

- `GET /api/projects/[projectId]/orchestration/runs?scope=card|workflow&status=...&limit=...`
- `POST /api/projects/[projectId]/orchestration/runs`
- `GET /api/projects/[projectId]/orchestration/runs/[runId]`
- `PATCH /api/projects/[projectId]/orchestration/runs/[runId]`

### Assignments

- `GET /api/projects/[projectId]/orchestration/runs/[runId]/assignments`
- `POST /api/projects/[projectId]/orchestration/runs/[runId]/assignments`
- `GET /api/projects/[projectId]/orchestration/runs/[runId]/assignments/[assignmentId]`
- `POST /api/projects/[projectId]/orchestration/runs/[runId]/assignments/[assignmentId]/dispatch`

### Checks

- `GET /api/projects/[projectId]/orchestration/runs/[runId]/checks`
- `POST /api/projects/[projectId]/orchestration/runs/[runId]/checks`
- `GET /api/projects/[projectId]/orchestration/runs/[runId]/checks/[checkId]`

### Approvals & PR candidates

- `GET /api/projects/[projectId]/orchestration/approvals?run_id=<runId>`
- `POST /api/projects/[projectId]/orchestration/approvals`
- `GET /api/projects/[projectId]/orchestration/approvals/[approvalId]`
- `PATCH /api/projects/[projectId]/orchestration/approvals/[approvalId]`
- `GET /api/projects/[projectId]/orchestration/pull-requests?run_id=<runId>`
- `POST /api/projects/[projectId]/orchestration/pull-requests`
- `GET /api/projects/[projectId]/orchestration/pull-requests/[prId]`
- `PATCH /api/projects/[projectId]/orchestration/pull-requests/[prId]`

### Recovery & Webhooks

- `POST /api/projects/[projectId]/orchestration/resume-blocked`
- `POST /api/projects/[projectId]/orchestration/webhooks/agentic-flow`

---

## Repository Operations

### POST /api/projects/[projectId]/repo/sync

Fetch/clone (if needed) and sync local base branch to `origin/<default_branch>`.
Use after merging PRs remotely to refresh local clone state.

### POST /api/projects/[projectId]/cards/[cardId]/push

Push completed card assignment branch from local clone to origin.

Requires:
- Connected repository
- Completed assignment for the card
- `GITHUB_TOKEN` configured

---

## Docs & Memory

### GET /api/docs

List docs from `docs/docs-index.yaml`.

### GET /api/docs?path=product/user-workflows-reference.md

Return raw markdown content for a specific docs path.

### GET /api/projects/[projectId]/memory

Return stored memory units for project plus storage paths (SQLite + RuVector).

---

## Dev-only Utilities

### POST /api/dev/restart-and-open

Development-only endpoint (`NODE_ENV=development`) used by "View on server":
- Requires `{ "projectId": "uuid" }`
- Starts `npm run dev` in project clone
- Uses first free port in `3001..3010`
- Opens browser tab after startup delay

## Project Files (Planned + Repository)

### GET /api/projects/[projectId]/files

File tree for the project. Two modes via `source` query param.

**Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `source` | `planned` (default) | Planned files from `card_planned_file` (intent, not produced code) |
| `source` | `repo` | Actual files from cloned repo (after build); includes diff status |
| `content` | `1` | With `source=repo` and `path`: return file content as `text/plain` |
| `diff` | `1` | With `source=repo` and `path`: return unified diff vs base branch as `text/x-diff` |
| `path` | `src/foo.ts` | Required when `content=1` or `diff=1`; file path (with or without leading slash) |

**Default (`source=planned`):** Returns hierarchical file tree built from `card_planned_file.logical_file_name`.

**`source=repo`:** Returns file tree from the latest build's cloned repo (feature branch). Requires at least one completed or running build with `worktree_root` set. Nodes include optional `status`: `added`, `modified`, `deleted`.

**`source=repo&content=1&path=...`:** Returns raw file content. `404` if file not found.

**`source=repo&diff=1&path=...`:** Returns `git diff base...feature -- path`. `404` if file unchanged or not found.

**Response (tree):** `200` — Array of `FileNode`:
```json
[
  {
    "name": "src",
    "type": "folder",
    "path": "/src",
    "status": "modified",
    "children": [
      { "name": "index.ts", "type": "file", "path": "/src/index.ts", "status": "added" }
    ]
  }
]
```

**Response (content/diff):** `200` — `text/plain` or `text/x-diff` body. `404` — Error JSON if no build or file not found.

---

## As-Built Notes

- **Mutations**: All map changes go through the actions endpoint; no direct writes.
- **Auth**: No auth/RLS; endpoints use anon access (single-user desktop app).
- **Database**: SQLite only; no Supabase or Postgres.
- **Planning credential model**: API key and Claude CLI paths are supported for planning endpoints.
- **Build credential model**: Build/orchestration routes require `ANTHROPIC_API_KEY` and do not use CLI-only fallback.
