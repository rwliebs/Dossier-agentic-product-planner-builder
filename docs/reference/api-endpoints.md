# API Endpoints Reference

As-built API surface for Dossier (`app/api/**/route.ts`).

## Base URL

- Local: `http://localhost:3000`
- All endpoints are under `/api`

## Response Conventions

- Many routes use shared helpers and return:
  ```json
  { "error": "validation_failed|not_found|conflict|action_rejected|internal_error", "message": "...", "details": {} }
  ```
- Some endpoints intentionally return different envelopes (for example `/api/setup`, `/api/github/repos`, and SSE endpoints). Treat each endpoint contract below as source of truth.
- Streaming endpoints return `Content-Type: text/event-stream`.

---

## Endpoint Inventory (quick scan)

### Setup, docs, and integrations

- `POST /api/setup`
- `GET /api/setup/status`
- `GET /api/docs`
- `GET /api/github/repos`
- `POST /api/github/repos`
- `POST /api/dev/restart-and-open` (development-only)

### Projects and planning

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/[projectId]`
- `PATCH /api/projects/[projectId]`
- `GET /api/projects/[projectId]/map`
- `GET /api/projects/[projectId]/actions`
- `POST /api/projects/[projectId]/actions`
- `POST /api/projects/[projectId]/actions/preview`
- `POST /api/projects/[projectId]/chat`
- `POST /api/projects/[projectId]/chat/stream`
- `GET /api/projects/[projectId]/memory`
- `GET /api/projects/[projectId]/files`

### Card context and approval

- Artifacts:
  - `GET/POST /api/projects/[projectId]/artifacts`
  - `GET/PATCH/DELETE /api/projects/[projectId]/artifacts/[artifactId]`
- Knowledge:
  - `GET/POST /requirements`, `PATCH/DELETE /requirements/[itemId]`
  - `GET/POST /facts`, `PATCH/DELETE /facts/[itemId]`
  - `GET/POST /assumptions`, `PATCH/DELETE /assumptions/[itemId]`
  - `GET/POST /questions`, `PATCH/DELETE /questions/[itemId]`
- Planned files:
  - `GET/POST /api/projects/[projectId]/cards/[cardId]/planned-files`
  - `PATCH/DELETE /api/projects/[projectId]/cards/[cardId]/planned-files/[fileId]`
- Card execution support:
  - `GET /api/projects/[projectId]/cards/[cardId]/context-artifacts`
  - `GET /api/projects/[projectId]/cards/[cardId]/produced-files`
  - `GET/POST /api/projects/[projectId]/cards/[cardId]/finalize`
  - `POST /api/projects/[projectId]/cards/[cardId]/push`

### Orchestration

- Triggering:
  - `POST /api/projects/[projectId]/orchestration/build`
  - `POST /api/projects/[projectId]/orchestration/resume-blocked`
- Runs:
  - `GET/POST /api/projects/[projectId]/orchestration/runs`
  - `GET/PATCH /api/projects/[projectId]/orchestration/runs/[runId]`
- Checks:
  - `GET/POST /api/projects/[projectId]/orchestration/runs/[runId]/checks`
  - `GET /api/projects/[projectId]/orchestration/runs/[runId]/checks/[checkId]`
- Assignments:
  - `GET/POST /api/projects/[projectId]/orchestration/runs/[runId]/assignments`
  - `GET /api/projects/[projectId]/orchestration/runs/[runId]/assignments/[assignmentId]`
  - `POST /api/projects/[projectId]/orchestration/runs/[runId]/assignments/[assignmentId]/dispatch`
- Approvals and PR candidates:
  - `GET/POST /api/projects/[projectId]/orchestration/approvals`
  - `GET/PATCH /api/projects/[projectId]/orchestration/approvals/[approvalId]`
  - `GET/POST /api/projects/[projectId]/orchestration/pull-requests`
  - `GET/PATCH /api/projects/[projectId]/orchestration/pull-requests/[prId]`
- Agent callback:
  - `POST /api/projects/[projectId]/orchestration/webhooks/agentic-flow`

---

## High-Value Contracts and Constraints

### Setup and integration endpoints

### `POST /api/setup`

Save API keys to `~/.dossier/config` and inject into current process env.

Request:

```json
{
  "anthropicApiKey": "optional string",
  "githubToken": "optional string"
}
```

Rules:

- At least one key must be non-empty after trim.
- Returns `{ success: true, configPath }` on success.

### `GET /api/setup/status`

Returns setup readiness:

```json
{
  "needsSetup": true,
  "missingKeys": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"],
  "configPath": "/home/.../.dossier/config"
}
```

### `GET /api/github/repos`

Lists repositories for the configured GitHub token (`env` first, then config file).

- `503` if token is missing.
- `401` if token is invalid.

### `GET /api/docs`

Docs panel API.

- No query param: returns indexed docs from `docs/docs-index.yaml`
- `?path=<relative-doc-path>`: returns `{ content }` for that document
- Normalizes and guards path traversal (`400 Invalid path`, `404 Doc not found`)

### `POST /api/github/repos`

Creates a user repo.

Request:

```json
{
  "name": "repo-name",
  "private": false
}
```

Constraints:

- `name` must match `^[a-zA-Z0-9._-]+$`
- `422` on invalid/existing repo names from GitHub API

### `POST /api/dev/restart-and-open`

Development-only helper (`NODE_ENV=development`):

- Requires `{ projectId }`
- Starts `npm run dev` in clone path on first free port `3001..3010`
- Returns `409` when clone does not exist and `503` when no view port is available

---

## Projects and planning

### `POST /api/projects`

Validated request schema accepts:

- `name` (required)
- `description`, `customer_personas`, `tech_stack`, `deployment`, `design_inspiration` (optional)
- `repo_url` (optional URL/null)
- `default_branch` (optional)

Current create behavior persists `name`, `repo_url`, and `default_branch`, and creates a default system policy profile.

### `PATCH /api/projects/[projectId]`

Partial updates for all fields listed above.

### `GET /api/projects/[projectId]/map`

Canonical map shape is:

`project -> workflows[] -> activities[] -> cards[]`

There is no `step` level in this response. Card nodes include build and finalization fields such as `build_state`, `last_built_at`, `last_build_ref`, and `finalized_at`.

### `POST /api/projects/[projectId]/actions`

Applies planning actions transactionally.

Request:

```json
{
  "actions": [
    {
      "id": "optional uuid",
      "action_type": "updateProject|createWorkflow|createActivity|createCard|updateCard|reorderCard|deleteWorkflow|deleteActivity|deleteCard|linkContextArtifact|createContextArtifact|upsertCardPlannedFile|upsertCardKnowledgeItem",
      "target_ref": {},
      "payload": {}
    }
  ],
  "idempotency_key": "optional string",
  "expected_sequence": 12
}
```

Operational constraints:

- `expected_sequence` mismatch returns `409`.
- Duplicate `idempotency_key` returns previous results with `idempotent: true`.
- Rejected actions return `422 action_rejected`.

### `POST /api/projects/[projectId]/actions/preview`

Dry-run only; does not mutate DB.

### `POST /api/projects/[projectId]/chat`

Non-streaming planning endpoint.

Modes:

- `scaffold`
- `populate` (requires `workflow_id`)
- `finalize`

Returns JSON with fields like:

```json
{
  "status": "success|error",
  "responseType": "clarification|actions|mixed",
  "applied": 0,
  "workflow_ids_created": []
}
```

### `POST /api/projects/[projectId]/chat/stream`

SSE variant for scaffold/populate/finalize. Emits events including:

- `error`
- `phase_complete`
- `done`

### `GET /api/projects/[projectId]/memory`

Returns memory units linked to project plus storage paths (`sqlite`, `ruvector`).

### `GET /api/projects/[projectId]/files`

Query parameters:

| Param | Values | Notes |
|---|---|---|
| `source` | `planned` (default), `repo` | planned DB tree vs repository tree |
| `cardId` | uuid | card-specific repo view (assignment/worktree) |
| `content` | `1` | with `source=repo&path=...`, return `text/plain` |
| `diff` | `1` | with `source=repo&path=...`, return `text/x-diff` |
| `path` | relative path | required for `content=1` or `diff=1` |

Notes:

- If `source=repo` and no run worktree exists, route falls back to clone tree when possible.
- If no assignment branch is selected, `diff=1` returns an empty diff body (`200`) against base branch context.

---

## Card-level endpoints

### Artifacts

Artifact type enum:

`doc|design|code|research|link|image|skill|mcp|cli|api|prompt|spec|runbook|test|scaffold`

Create requires at least one of `content`, `uri`, `integration_ref`.

### Knowledge items

Create payload shape (requirements/facts/assumptions/questions):

```json
{
  "text": "string",
  "source": "agent|user|imported",
  "status": "draft|approved|rejected",
  "confidence": 0.8,
  "position": 0
}
```

Facts can also include `evidence_source`.

### Planned files

`artifact_kind`:

`component|endpoint|service|schema|hook|util|middleware|job|config`

`action`: `create|edit`

`status`: `proposed|user_edited|approved`

### `GET /cards/[cardId]/context-artifacts`

Returns expanded artifact objects linked to the card.

### `GET /cards/[cardId]/produced-files`

Returns `[{ path, status }]` for `added|modified` files from latest completed card assignment.

### `GET /cards/[cardId]/finalize`

Returns finalization package:

- `card`
- `project_docs`
- `card_artifacts`
- `requirements`
- `planned_files`
- `finalized_at`

### `POST /cards/[cardId]/finalize`

SSE endpoint. Preconditions:

- card exists in project
- card is not already finalized
- project is finalized
- card has at least one requirement
- card has at least one planned file/folder
- planning LLM is enabled

Emits `finalize_progress`, `phase_complete`, and `done`.

### `POST /cards/[cardId]/push`

Pushes completed card feature branch to remote:

- `400` if repo is not connected
- `409` if there is no completed build for the card
- `401/502` on push failures

---

## Orchestration API

### Triggering

#### `POST /orchestration/build`

Request:

```json
{
  "scope": "workflow|card",
  "workflow_id": "required when scope=workflow",
  "card_id": "required when scope=card",
  "trigger_type": "card|workflow|manual",
  "initiated_by": "string"
}
```

Returns `202` with `{ runId, assignmentIds, outcome_type }` on success.

#### `POST /orchestration/resume-blocked`

Request:

```json
{
  "card_id": "uuid",
  "actor": "optional string"
}
```

Returns `202` with resumed assignment/run identifiers.

### Runs

#### `GET /orchestration/runs`

Query: `scope?`, `status?`, `limit?`

#### `POST /orchestration/runs`

Creates run directly; requires `repo_url`, `base_branch`, `run_input_snapshot`, and scope-specific IDs.

#### `PATCH /orchestration/runs/[runId]`

Allowed status transitions:

- `queued -> running|cancelled`
- `running -> blocked|failed|completed|cancelled`
- `blocked -> running|failed|cancelled`
- `failed -> queued`
- `completed` and `cancelled` are terminal

### Checks

- `POST /orchestration/runs/[runId]/checks` requires `check_type` and `status`
- check types: `dependency|security|policy|lint|unit|integration|e2e`
- statuses: `passed|failed|skipped`

### Assignments

`POST /orchestration/runs/[runId]/assignments` requires:

- `card_id`
- `agent_role` (`planner|coder|reviewer|integrator|tester`)
- `agent_profile`
- `feature_branch`
- `allowed_paths` (non-empty)
- optional `forbidden_paths`, `worktree_path`, `assignment_input_snapshot`

`POST /.../dispatch` accepts optional `{ actor }` and returns `202` with execution IDs.

### Approvals and PR candidates

- `GET /orchestration/approvals` requires `run_id` query param.
- `POST /orchestration/approvals` requires `run_id`, `approval_type` (`create_pr|merge_pr`), `requested_by`.
- `PATCH /orchestration/approvals/[approvalId]` requires `status` and `resolved_by`.
- `GET /orchestration/pull-requests` requires `run_id`.
- `POST /orchestration/pull-requests` requires `run_id`, `base_branch`, `head_branch`, `title`, `description`.
- `PATCH /orchestration/pull-requests/[prId]` requires `status`, optional `pr_url`.

### Agent webhook

`POST /orchestration/webhooks/agentic-flow` requires:

- `event_type`
- `assignment_id`

Allowed `event_type` values:

- `execution_started`
- `commit_created`
- `execution_completed`
- `execution_failed`
- `execution_blocked`

---

## Operational Pitfalls

- **Different error envelopes by route:** do not hardcode one global error parser for all endpoints.
- **SSE consumers:** finalize and stream routes require event-stream handling (`done` event indicates completion).
- **Build output visibility:** `produced-files` and `files?source=repo` depend on run/assignment/worktree state; empty responses can be valid.
- **Setup dependence:** GitHub and planning workflows depend on configured `GITHUB_TOKEN` and `ANTHROPIC_API_KEY`.

## As-Built Notes

- Mutations to map data flow through validated actions and mutation pipeline.
- No auth/RLS layer in this single-user deployment mode.
- SQLite is the default runtime datastore for API flows.
