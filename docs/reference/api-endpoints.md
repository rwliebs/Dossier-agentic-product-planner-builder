# API Endpoints Reference

Step 4 API layer for the Dossier planning system. Aligns with [dual-llm-integration-strategy.md](../strategy/dual-llm-integration-strategy.md) Phase 2: Persistence and API Baseline.

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

## Dual LLM Strategy Alignment

- **Planning Context Engine (Step 8):** `POST /api/projects/[id]/actions` receives `PlanningAction[]`. Engine must submit through this endpoint; no direct writes.
- **Build Orchestrator (Step 9):** `GET /api/projects/[id]/map` provides `run_input_snapshot` structure. `GET .../planned-files` returns approved files for assignment. `GET .../files?source=repo` returns produced files from the cloned repo after build (with diff status).
- **Action-centric mutations:** All map changes go through the actions endpoint.
- **No-auth-first POC:** Auth/RLS deferred; endpoints use anon key.
