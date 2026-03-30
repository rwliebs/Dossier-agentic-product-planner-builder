---
document_id: doc.planning
last_verified: 2026-03-30
tokens_estimate: 750
tags:
  - planning
  - llm
  - chat
anchors:
  - id: contract
    summary: "Planning LLM converts ideas to PlanningAction[]; never code-gen"
  - id: modes
    summary: "Scaffold, populate, full; mode selected by map state"
  - id: flow
    summary: "Chat → Claude → stream-action-parser → actions"
ttl_expires_on: null
---
# Planning Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Planning LLM outputs PlanningAction[] only; never production code or file contents
- INVARIANT: Code-generation intents rejected; respond with clarification redirect
- INVARIANT: IDs in actions must exist in current map state; new entities get fresh UUIDs
- INVARIANT: Planning auth can use API key or Claude CLI; build orchestration remains API-key-based

### Boundaries
- ALLOWED: createWorkflow, createActivity, createCard, updateCard, linkContextArtifact, upsertCardPlannedFile, createContextArtifact, etc.
- ALLOWED (finalize mode only): createContextArtifact with type 'test' containing e2e test code
- FORBIDDEN: Generating implementation/production code; triggering builds; writing to GitHub; creating real files

---

## Implementation

### Modes
| Mode | When | Output |
|------|------|--------|
| scaffold | Map empty or no workflows | updateProject + createWorkflow only |
| populate | Workflows exist, activities/cards sparse | createActivity, createStep, createCard |
| full | Map has structure | All action types; refinements, links, planned files |
| finalize | Map fully planned; user triggers | createContextArtifact (project docs + card e2e tests) |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message → POST /chat/stream
  → buildPlanningSystemPrompt() | buildScaffoldSystemPrompt() | buildPopulateSystemPrompt() | buildFinalizeSystemPrompt()
  → auth resolution (API key or Claude CLI)
  → Claude call (SDK stream or CLI stream-json)
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → POST /actions (validate + apply)
```

### Auth + Transport Paths

| Path | When used | Transport |
|------|-----------|-----------|
| API key path | `ANTHROPIC_API_KEY` available via env/config/CLI settings file | Anthropic SDK bridge (`runPlanningQuery` / `streamPlanningQuery`) |
| CLI path | No API key resolved, but `claude` CLI is installed/authenticated | `claude -p` subprocess (`--output-format json` or `stream-json`) |

Build agents do not use the CLI path; they require `ANTHROPIC_API_KEY`.

### Per-Card Finalize Flow
```
User clicks "Finalize" on card → POST /cards/[cardId]/finalize
  → SSE pipeline: link project docs + generate e2e test artifact + stamp finalized_at
  → Optional memory ingest for build retrieval context
  → Card becomes build-ready
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning auth/router (API-key SDK path or Claude CLI subprocess path) |
| `lib/llm/planning-credential.ts` | Resolves planning credential from env/config/`~/.claude/settings.json` |
| `app/api/projects/[id]/chat/route.ts` | Non-streaming chat |
| `app/api/projects/[id]/chat/stream/route.ts` | Streaming chat (scaffold, populate, finalize) |
| `app/api/projects/[id]/cards/[cardId]/finalize/route.ts` | Per-card finalize endpoint |

### Response Types
- `clarification`: Questions only; `actions: []`
- `actions`: PlanningAction[]; optional message
- `mixed`: Both message and partial actions

---

## Verification
- [ ] No action proposes code generation (validate-action rejects)
- [ ] Prompt instructs LLM to use existing IDs from context
- [ ] User actions follow-up after populate (agent prompts for View Details, Build, etc.)

## Related
- [mutation-reference.md](mutation-reference.md)
