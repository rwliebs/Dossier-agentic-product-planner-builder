# ADR 0009: Planning Chat — Streaming vs Non-Streaming

**Date**: 2026-02-23
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#llm, docs/domains/planning-reference.md#modes

## Context

The planning flow offered both a non-streaming endpoint (`POST /api/projects/[projectId]/chat`) and a streaming endpoint (`POST /api/projects/[projectId]/chat/stream`). Streaming was introduced for faster perceived results by sending actions as they were applied.

In practice, streaming did not deliver faster results for the main planning chat: the client consumed the full stream before updating the UI. However, streaming remained valuable for long-running multi-step operations (populate, finalize, card finalize) where SSE progress events provide real-time visibility.

## Decision

Split by use case:

- **Non-streaming** (`POST /chat`): Main planning chat. Backend selects prompt by map state (empty → scaffold, has structure → full planning). Single `fetch` + `json()`. One code path to maintain.
- **Streaming** (`POST /chat/stream`): Reserved for multi-step or long-running flows only:
  - **Populate**: per-workflow, adds activities and cards (`mode=populate`, `workflow_id`)
  - **Finalize**: project-level, creates 5+ context documents in parallel (`mode=finalize`)
  - **Card finalize**: per-card, assembles context and stamps `finalized_at` (separate endpoint with SSE)

## Consequences

- Main chat is simpler: one request/response, no SSE parsing
- Multi-step flows retain real-time progress events
- Two code paths remain but with clear separation: chat = non-streaming, batch operations = streaming
- `stream-action-parser.ts` is retained for the streaming path

## Rollback

Consolidate all operations to one path (either all streaming or all non-streaming).
