# Chat Consolidation Strategy

## Problem
1. The planning chat hardcoded `mode: 'scaffold'`, so the agent always tried to create project structure — even on established maps
2. The streaming pipeline (`/chat/stream`) provided no incremental UX; the LLM outputs a single JSON blob parsed only after the stream ends
3. The full planning prompt (`buildPlanningSystemPrompt`) supports all action types but was never used by the chat flow

## Decision
Switch the chat to the non-streaming `/chat` route. Use two prompt states:
- **Map empty** (no workflows) → scaffold prompt
- **Map has structure** (≥1 workflow) → full planning prompt with all action types

No mode parameter from the frontend. Backend decides based on map state.

## Changes Made

### Backend (`/chat` route)
- Checks `state.workflows.size` to pick prompt
- Empty → `buildScaffoldSystemPrompt` + `buildScaffoldUserMessage`
- Has structure → `buildPlanningSystemPrompt` + `buildPlanningUserMessage`
- Actions applied directly to DB via `pipelineApply`
- Returns `{ status, responseType, message, applied, workflow_ids_created, errors }`
- `claudePlanningRequest` accepts `systemPromptOverride` / `userMessageOverride`

### Frontend (`left-sidebar.tsx` `handleSubmit`)
- Simple `fetch` + `json()` to `/chat`
- No SSE parsing, no buffer management, no event loop
- Shows message, triggers `onPlanningApplied` refresh

### Unchanged
- `/chat/stream` — kept for populate (button-triggered per-workflow) and finalize (multi-step)
- `page.tsx` populate/finalize flows — still use `/chat/stream`
- `stream-action-parser.ts` — retained for stream route

## Result
On an established map, the user can say "add a card for password reset to Login" and the full planning prompt handles it — creates cards, updates existing ones, links artifacts, etc. No more scaffold-only cage.

---

## Production usage: streaming vs non-streaming

**Main planning (production path):** **Non-streaming** (`POST /api/projects/[id]/chat`).

- Used by: `app/page.tsx` (project planning input) and `components/dossier/left-sidebar.tsx` (planning chat).
- Single `fetch` + `response.json()`. No SSE. Backend uses `claudePlanningRequest` (one-shot) and `parsePlanningResponse`.

**Streaming is used only for:**

- **Populate** (add activities/cards to one workflow): `page.tsx` calls `POST .../chat/stream` with `mode=populate` and `workflow_id`.
- **Finalize** (project-level context artifacts + per-card tests): `page.tsx` calls `POST .../chat/stream` with `mode=finalize`.
- **Card finalize** (link docs, generate e2e test, stamp `finalized_at`): `POST .../cards/[cardId]/finalize` returns an SSE stream.

So in production, the default “user types in chat” flow is non-streaming; streaming is reserved for multi-step or long-running flows (populate, finalize, card finalize).
