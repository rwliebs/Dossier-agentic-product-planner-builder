---
document_id: doc.planning
last_verified: 2026-03-23
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
| finalize | User triggers approval/finalize | createContextArtifact (project docs, scaffold docs, and card e2e tests) |

Mode selected by `lib/llm/planning-prompt.ts` based on map state.

### Flow
```
User message → POST /chat/stream
  → buildScaffoldSystemPrompt() | buildPlanningSystemPrompt() | finalize prompts
  → claude-client -> planning-sdk-runner (Agent SDK query())
  → stream-action-parser (parse JSON blocks)
  → PlanningAction[] emitted
  → validatePlanningOutput() + pipelineApply() inside chat route
```

Planning uses read-only tools:
- Always: `WebSearch`
- When repo is connected and cloned: `Read`, `Glob`, `Grep`, `WebSearch` (cwd set to clone path)

Auth resolution for planning:
1. `ANTHROPIC_API_KEY` from env
2. `ANTHROPIC_API_KEY` from `~/.dossier/config`
3. Claude CLI settings (`~/.claude/settings.json`, respecting `CLAUDE_CONFIG_DIR`):
   - `env.ANTHROPIC_API_KEY`, or
   - `env.ANTHROPIC_AUTH_TOKEN` (also mapped to `CLAUDE_CODE_OAUTH_TOKEN`)

### Per-Card Finalize Flow
```
User clicks "Finalize" on card → POST /cards/[cardId]/finalize
  → Validate prerequisites:
      project.finalized_at exists
      card has requirements
      card has planned files
      card not already finalized
  → Link project docs to card (doc/spec/design)
  → Generate required test artifact + optional card-specific docs
  → Set card.finalized_at
  → Best-effort memory ingestion for card context
```

### Project Finalize Flow (chat mode=finalize)
```
POST /chat or /chat/stream with mode=finalize
  → runFinalizeMultiStep() executes FINALIZE_DOC_SPECS in parallel
  → each doc emits createContextArtifact
  → failure if any required doc missing
  → parse root folders from architectural-summary
  → ensure clone and create root folders + scaffold files in base branch
  → push base branch
  → set project.finalized_at
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/llm/planning-prompt.ts` | System prompts; mode selection |
| `lib/llm/stream-action-parser.ts` | Parse streaming JSON → actions |
| `lib/llm/build-preview-response.ts` | Preview response before apply |
| `lib/llm/claude-client.ts` | Planning LLM client; auth routing + timeouts |
| `lib/llm/planning-sdk-runner.ts` | Agent SDK query wrapper for planning (final result only) |
| `lib/llm/planning-credential.ts` | Resolves env/config/CLI credentials |
| `lib/llm/run-finalize-multistep.ts` | Project finalize doc generation (parallel sub-steps) |
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
