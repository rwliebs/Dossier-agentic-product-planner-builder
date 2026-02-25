# Duplicate & Conflicting Code Report

Generated from a repo-wide scan for literal duplicates, same-function code, and conflicting patterns (e.g. streaming vs non-streaming LLM).

---

## 1. Literal / copy-paste duplicates

### 1.1 Zod validation details (20+ API routes)

**Pattern:** Building a `details` object from `parsed.error.errors` for 400 validation responses.

**Repeated block (same in every file):**
```ts
const details: Record<string, string[]> = {};
parsed.error.errors.forEach((e) => {
  const path = e.path.join(".") || "body";
  if (!details[path]) details[path] = [];
  details[path].push(e.message);
});
```

**Locations:**  
`app/api/projects/[projectId]/chat/route.ts`, `chat/stream/route.ts`, `route.ts`, `cards/.../assumptions/route.ts`, `questions/route.ts`, `requirements/route.ts`, `facts/route.ts`, `planned-files/route.ts`, `artifacts/route.ts`, `actions/route.ts`, `actions/preview/route.ts`, `orchestration/build/route.ts`, `orchestration/approvals/route.ts`, `orchestration/runs/route.ts`, `orchestration/runs/[runId]/assignments/route.ts`, `orchestration/resume-blocked/route.ts`, plus several `[itemId]/route.ts` variants (see grep for full list).

**Recommendation:** Add a shared helper and use existing `validationError()` from `lib/api/response-helpers.ts`:

- Add e.g. `lib/validation/zod-details.ts`: `export function zodErrorDetails(error: z.ZodError): Record<string, string[]>`.
- In each route: `if (!parsed.success) return validationError("Invalid request body", zodErrorDetails(parsed.error));`

---

### 1.2 `sseEvent` helper (identical in two files)

**Definition (same in both):**
```ts
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

**Locations:**
- `app/api/projects/[projectId]/chat/stream/route.ts` (line 18)
- `app/api/projects/[projectId]/cards/[cardId]/finalize/route.ts` (line 28)

**Recommendation:** Move to e.g. `lib/api/sse.ts` and import in both routes.

---

### 1.3 Post-finalize sync block (chat vs chat/stream)

**Logic:** After `runFinalizeMultiStep`, fetch artifacts → get architectural-summary content → parse root folders → ensureClone → createRootFoldersInRepo → updateProject `finalized_at`.

**Locations:**  
Duplicated in full in:
- `app/api/projects/[projectId]/chat/route.ts` (lines ~108–136)
- `app/api/projects/[projectId]/chat/stream/route.ts` (lines ~108–135)

Only differences: log prefix (`[chat]` vs `[chat/stream]`), and one returns `json(...)` the other `emit("phase_complete", ...); return`.

**Recommendation:** Extract to e.g. `lib/orchestration/post-finalize-sync.ts`:

- `export async function runPostFinalizeSync(db, projectId, logPrefix?: string): Promise<void>`
- Call from both chat and chat/stream after `runFinalizeMultiStep`.

---

### 1.4 Duplicate ADR directories

**Locations:**  
- `docs/adr/` (canonical per README and .cursor/agents)
- `documents/adr/` (duplicate set of ADRs)

Overlapping files: 0001, 0002, 0003, 0005, 0006, 0007, README. Some ADRs exist only in one tree (e.g. 0004 only in documents, 0008/0009 only in docs).

**Recommendation:** Treat `docs/adr/` as source of truth; merge any unique content from `documents/adr/` into `docs/adr/`, then remove `documents/adr/` and update any references (e.g. code comments pointing at documents/adr).

---

## 2. Same-function code (different implementations)

### 2.1 Planning action normalization (two parsers)

**Purpose:** Turn raw LLM JSON into validated `PlanningAction` (ids, project_id, target_ref, payload, action_type).

**Implementations:**
- **`lib/llm/parse-planning-response.ts`**: `normalizeAction(obj)` — no idRemap; used for non-streaming full-text parse.
- **`lib/llm/stream-action-parser.ts`**: `normalizeAction(obj, idRemap)` — idRemap for create* ID consistency, extra handling for createCard `activity_id` / `workflow_activity_id`, and UUID replacement for createWorkflow/createActivity/createCard.

**Conflict risk:** Stream path has stricter and richer normalization. Non-stream path could produce different IDs or miss edge cases (e.g. activity_id in payload), so behavior can differ between `/chat` and `/chat/stream` for the same LLM output.

**Recommendation:** Introduce a single normalization module (e.g. `lib/llm/normalize-planning-action.ts`) used by both parsers, with optional idRemap for streaming. Share UUID and target_ref logic; keep stream-specific remapping in the stream parser but call into the shared normalizer.

---

### 2.2 JSON extraction from LLM text

**Purpose:** Pull JSON object or array out of markdown, preamble, or trailing text.

**Implementations:**
- **`parse-planning-response.ts`**: `extractJsonArray`, `extractJsonObject` (separate; array uses `[`/`]` scan, object uses `{`/`}`).
- **`stream-action-parser.ts`**: `extractJsonText(text)` — object-only, code block then balanced `{`/`}`.

Logic (code blocks, balanced braces, string handling) is similar but not shared; behavior can drift (e.g. one supports array, the other only object).

**Recommendation:** If consolidating parsers is acceptable, add shared `extractJsonObject` / `extractJsonArray` in one place and use from both; otherwise at least document the two contracts and any intentional differences.

---

### 2.3 Stream → text / SSE consumption

**Pattern:** Read `ReadableStream` with `getReader()` + `TextDecoder` + `buffer += decoder.decode(value[, { stream: true }])`.

**Locations:**
- `lib/llm/stream-action-parser.ts`: read stream into buffer, split lines, parse NDJSON.
- `lib/llm/run-llm-substep.ts`: tee stream, one branch read to string for logging (`rawLlmOutput`).
- `__tests__/api/chat-stream-mock.test.ts`: read response body to string.
- `__tests__/e2e/helpers.ts`: inside `consumeSSE` — read body, split by `\n\n+`, parse event/data lines.
- `app/page.tsx`: read finalize SSE body, same split/parse pattern for `event:` / `data:`.

**Recommendation:**  
- Add a small `readStreamToText(stream: ReadableStream<Uint8Array | string>): Promise<string>` (e.g. in `lib/utils.ts` or `lib/stream-utils.ts`) and use it in tests and in `run-llm-substep` for the log branch.  
- For SSE: `helpers.ts` already has `consumeSSE`. Consider reusing or importing a shared SSE consumer in `app/page.tsx` for the finalize flow so parsing and event handling are consistent and testable.

---

## 3. Conflicting or divergent behavior (streaming vs non-streaming)

### 3.1 Two chat endpoints: `/chat` vs `/chat/stream`

**Documented in:** `docs/strategy/chat-consolidation-strategy.md` — main planning chat uses non-streaming `/chat`; `/chat/stream` kept for populate (per-workflow) and finalize (multi-step).

**Differences that can cause inconsistent behavior:**

| Aspect | `/chat` (non-stream) | `/chat/stream` |
|--------|------------------------|----------------|
| **LLM call** | `claudePlanningRequest` (one shot, full text) | `claudeStreamingRequest` + `runLlmSubStep` (stream, parse incrementally) |
| **Parsing** | `parsePlanningResponse(llmText)` (batch) | `parseActionsFromStream(stream)` (incremental) |
| **Prompt choice** | Empty map → scaffold; has workflows → full planning | Default branch always uses scaffold prompt (scaffold user message); no “full planning” path for default mode |
| **Linked artifacts cap** | `getLinkedArtifactsForPrompt(state, 5)` | `getLinkedArtifactsForPrompt(state, 3)` |
| **Populate** | Supports “no mode” + POPULATE_INTENT → auto-populate all empty workflows | Only `mode=populate` + `workflow_id`; no intent-based auto-populate |
| **Error responses** | JSON body with user-facing message mapping (timeout, 429, API key, etc.) | SSE `error` event with reason string; no shared user-message mapping |

So: same “planning” surface but different prompts, parsing, and error handling. Not strictly “duplicate code,” but two parallel implementations of planning that can behave differently.

**Recommendation:**  
- Align behavior where possible: e.g. use same `getLinkedArtifactsForPrompt(state, N)` constant and document why N might differ if intentional.  
- Consider sharing “planning LLM error → user message” logic (e.g. in `lib/llm/claude-client.ts` or a small `lib/llm/llm-error-messages.ts`) and use it for both JSON error responses and SSE `error.reason`.  
- Document in `chat-consolidation-strategy.md` that stream route currently does not use full planning prompt for the default (non-finalize, non-populate) case and whether that’s intentional.

---

### 3.2 Claude client: streaming vs non-streaming

**Location:** `lib/llm/claude-client.ts`

- `claudePlanningRequest`: `client.messages.create(..., { stream: false })`.  
- `claudeStreamingRequest`: `client.messages.stream(...)` → wrapped in `ReadableStream<string>`.

This is intentional (two call patterns), not duplicate logic. Shared pieces: API key check, model/maxTokens/timeout config, and prompt caching. Timeout semantics differ (request-level vs idle-based), which is appropriate.

**Recommendation:** No structural change needed; consider extracting shared config (model, maxTokens, timeout constants) and key validation into a small helper to avoid drift.

---

## 4. Summary table

| Category | What | Locations | Action |
|----------|------|-----------|--------|
| Literal | Zod validation details | 20+ API routes | Add `zodErrorDetails()`, use with `validationError()` |
| Literal | `sseEvent()` | chat/stream, card finalize | Move to `lib/api/sse.ts` |
| Literal | Post-finalize sync | chat + chat/stream | Extract `runPostFinalizeSync()` |
| Literal | ADR docs | docs/adr + documents/adr | Merge into docs/adr, delete documents/adr |
| Same-function | Action normalization | parse-planning-response, stream-action-parser | Shared normalizer with optional idRemap |
| Same-function | JSON extraction | parse-planning-response, stream-action-parser | Shared extractors or documented contract |
| Same-function | Stream→text / SSE read | 5 places | `readStreamToText()`; reuse or share SSE consumer |
| Conflicting | Chat vs chat/stream | Two routes | Align constants and error messages; document prompt/populate differences |

---

*Report generated from codebase scan. Recommendations are refactor suggestions, not mandatory.*

---

## Cleanup applied (feature/duplicate-code-cleanup)

- **Zod validation details:** Added `lib/validation/zod-details.ts` (`zodErrorDetails`) and updated 23 API routes to use it with `validationError()` or existing JSON response shape.
- **sseEvent:** Added `lib/api/sse.ts` with `sseEvent()`; `chat/stream` and `cards/.../finalize` routes now import it.
- **ADR consolidation:** Removed duplicate `documents/adr/`; kept `docs/adr/` (newest retained where filenames overlapped).
- **JSON extraction:** Added `lib/llm/json-extract.ts` with `extractJsonObject` and `extractJsonArray` (balanced-brace + code-block + fast-path); `parse-planning-response.ts` and `stream-action-parser.ts` use it.
- **Stream consumption:** Added `consumeSSEStream()` in `lib/api/sse.ts`; `__tests__/e2e/helpers.ts` and `app/page.tsx` (card finalize) use it.
- **Production path:** Documented in `docs/strategy/chat-consolidation-strategy.md`: main planning = non-streaming `/chat`; streaming only for populate, finalize, and card finalize.
