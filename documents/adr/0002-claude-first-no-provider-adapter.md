# ADR 0002: Claude-First Planning LLM (No Provider Adapter in MVP)

- Status: Accepted
- Date: 2026-02-12
- Updated: 2026-02-13 (Step 8 implementation)

## Context

The MVP needs one reliable planning model quickly, while avoiding abstraction complexity before fit is proven.

## Decision

Use direct Claude integration for planning in MVP and defer multi-provider adapter architecture.

- Implement direct client wiring for planning endpoints.
- Keep internal interfaces clean so adapter extraction can be introduced later if needed.

## Implementation (Step 8)

### API Endpoint Contract

**POST /api/projects/[projectId]/chat**

Request body:
```json
{ "message": "Add a login flow for the app" }
```

Response (200):
```json
{
  "status": "success",
  "actions": [ /* PlanningAction[] */ ],
  "preview": {
    "added": { "workflows": [], "activities": [], "steps": [], "cards": [] },
    "modified": { "cards": [], "artifacts": [] },
    "reordered": [],
    "summary": "Creates 3 cards in Authentication workflow"
  },
  "errors": [ { "action": {...}, "reason": "..." } ],
  "metadata": { "tokens": 1234, "model": "claude-sonnet-4-5-20250929" }
}
```

Error codes:
- 400: Invalid request (missing message, invalid JSON)
- 404: Project not found
- 502: LLM service error (timeout, rate limit, API key missing)
- 503: Planning LLM disabled (NEXT_PUBLIC_PLANNING_LLM_ENABLED=false)

### Environment Variables

- `ANTHROPIC_API_KEY` (required): Anthropic API key for Claude
- `PLANNING_LLM_MODEL` (optional): Model override, default `claude-sonnet-4-5-20250929`
- `NEXT_PUBLIC_PLANNING_LLM_ENABLED` (optional): Set to `false` to disable, default `true`
- `NEXT_PUBLIC_DEFAULT_PROJECT_ID` (optional): Default project for chat when no project selected

### Future Provider Adapter Extraction

When multi-provider support is needed:
1. Extract `lib/llm/claude-client.ts` behind `PlanningLLMClient` interface
2. Add `PlanningLLMClient` implementations for OpenAI, Vertex, etc.
3. Route selection via env or config; API contract unchanged

## Consequences

- Lower implementation complexity and faster delivery.
- Less flexibility in MVP if provider change is needed mid-stream.
- Future adapter work remains possible as a controlled refactor.

## Alternatives Considered

- Full provider adapter now: rejected as premature complexity for MVP.
