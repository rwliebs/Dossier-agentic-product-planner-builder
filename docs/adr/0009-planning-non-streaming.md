# ADR 0009: Planning Non-Streaming

- Status: Accepted
- Date: 2026-02-23

## Context

The planning flow offered both a non-streaming endpoint (`POST /api/projects/[projectId]/chat`) and a streaming endpoint (`POST /api/projects/[projectId]/chat/stream`) for scaffold, populate, and finalize. Streaming was introduced with the intent of delivering faster perceived results by sending actions to the client as they were applied.

In practice, **streaming did not deliver faster results for the user**:

- The client often consumed the full stream before updating the UI (e.g. reading the response body in a loop until `done`), so the user still waited for the entire operation before seeing a result.
- Where incremental SSE events were processed (e.g. `action` events), the UI did not consistently reflect partial progress in a way that made the experience feel faster.
- Finalize and multi-workflow populate remained long-running; streaming did not change time-to-first-meaningful-content in a way users could perceive.

We could invest in true incremental UX (e.g. applying and rendering each action as it arrives), but that would require non-trivial frontend and state-handling changes. Absent that, streaming added complexity (SSE, stream parsing, two code paths) without a clear user benefit.

## Decision

**Use non-streaming for planning.** The canonical planning API is the non-streaming `POST /api/projects/[projectId]/chat`. It supports the same operations (scaffold, populate, finalize) and returns a single JSON response when the work is done.

- Clients call the non-streaming endpoint for all planning operations.
- The streaming endpoint is deprecated for planning; it may be removed or retained only for compatibility during a transition.
- New planning features are implemented on the non-streaming path only.

## Consequences

- **Simpler client code**: One request/response per operation; no SSE parsing or stream state.
- **Single code path**: One route and one LLM/apply flow to maintain and test.
- **Same total wait time**: Users still wait for the full planning step to complete; we do not claim faster time-to-result from this change.
- **Possible future**: If we later add incremental application of actions and progressive UI updates, we can revisit streaming or chunked responses with a clear UX design.

## Alternatives Considered

- **Fix streaming UX**: Implement true incremental updates (apply and show each action as it arrives). Rejected for this change: larger scope; we first simplify to non-streaming and can revisit if we prioritize incremental UX.
- **Keep both and recommend non-streaming**: Keeps two paths and confusion. Rejected in favor of a single supported path.
- **Stream but buffer and flush once**: Still two paths and no real benefit over a single JSON response. Rejected.
