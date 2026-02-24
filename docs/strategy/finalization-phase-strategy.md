# Finalization Phase Strategy

## Purpose

Define the design for a fourth planning phase ("finalize") that produces build-ready context documents and executable e2e test code, and a per-card finalize action that assembles context for user review before build trigger.

This document supplements [dual-llm-integration-strategy.md](./dual-llm-integration-strategy.md) and is the source of truth for finalization-phase decisions.

## Product Goal

After planning produces a complete story map (workflows, activities, cards with requirements, knowledge items, and planned files), the system must:

1. Generate project-wide context documents that orient build agents.
2. Generate per-card e2e test code that encodes requirements as executable acceptance criteria.
3. Give the user a per-card finalize gate where they review assembled context and tests before triggering build.

## Planning Pipeline (Updated)

| Phase | Mode | Trigger | Output |
|-------|------|---------|--------|
| 1. Idea | `scaffold` | User submits idea | `updateProject` + `createWorkflow` |
| 2. Workflows | `populate` | User confirms scaffold | `createActivity` + `createCard` per workflow |
| 3. Actions/Cards | `full` | Map has structure | All action types: refinements, knowledge, planned files |
| **4. Finalize** | **`finalize`** | **User triggers project finalization** | **`createContextArtifact` for project docs + card e2e tests** |

After Phase 4: per-card "Finalize" action assembles context and gives user a review/edit gate.
After per-card finalize: card is build-ready.

## Strategy Constraint Updates

### Relaxation: Test Code in Planning

**Previous constraint**: "Planning LLM outputs PlanningAction[] only; never production code or file contents."

**Updated constraint**: Planning LLM outputs PlanningAction[] only; never production/implementation code. **Exception**: finalize mode produces e2e test code as `ContextArtifact` content with `type: 'test'`. This is permitted because:

- Tests are executable specifications of requirements, not implementation code.
- They define "what must be true" without prescribing "how to build it."
- Build agents use them as acceptance gates, not as implementation guidance.
- The user reviews and can edit tests before they become build inputs.

### Retained: No Test Artifacts in CardPlannedFile

**Unchanged**: `CardPlannedFile.artifact_kind` must not include test artifacts. Tests live as `ContextArtifact` records with `type: 'test'`, linked to cards via `CardContextArtifact`. This keeps the planned-file schema focused on implementation artifacts and avoids conflating "what to build" with "how to verify."

## Phase 4: Project-Wide Finalization

### Trigger

User clicks "Finalize Project" in the UI after planning phases 1-3 are complete. The system validates that the map has sufficient structure (workflows, activities, cards with requirements) before allowing finalization.

### LLM Mode: `finalize` (Multi-Step)

Finalize mode runs multiple sequential LLM calls within a single SSE stream to prevent timeouts on large projects. Each sub-step has its own focused prompt and produces a subset of the total output.

#### Sub-steps 1–5: Project-Wide Context Documents (1 LLM call each)

Each project document gets its own LLM call with a focused prompt. The five categories of project-level `ContextArtifact` records:

| Document | Artifact Type | Content |
|----------|--------------|---------|
| Architectural Summary | `doc` | Tech stack, service topology, key patterns, deployment model; MUST include "## Root folder structure" with bullet list of paths (e.g. app/, components/, lib/) |
| Data Contracts | `spec` | Schemas, API contracts, shared interfaces, data flow |
| Domain Summaries | `doc` | Bounded contexts, domain models, entity relationships, glossary |
| User Workflow Summaries | `doc` | Per-workflow: user outcomes, activity flow, card dependencies, cross-workflow connections |
| Design System | `design` | Component palette, color tokens, typography, spacing conventions, interaction patterns |

Each document is derived from the current map state: project metadata (tech_stack, deployment, design_inspiration, customer_personas), workflow/activity/card titles and descriptions, requirements, and planned files.

#### Sub-steps 6–N: Per-Card E2E Tests (1 LLM call per card)

For each card that has requirements, a separate LLM call generates a `ContextArtifact` with:

- `type: 'test'`
- `name`: test file path (e.g., `__tests__/e2e/user-authentication.test.ts`)
- `content`: actual runnable test code

Each per-card call receives only the card's requirements, planned files, and a lightweight project summary — not the full map state. This keeps input tokens low and response times fast.

Test guidelines the LLM must follow:

- **Outcome-based**: each test validates that a requirement is realized, not how it's implemented.
- **One test per requirement**: clear 1:1 mapping from `CardRequirement` to test case.
- **Framework**: Playwright for e2e (consistent with existing test suite).
- **Self-contained**: each test file can run independently.
- **Descriptive names**: test names read as acceptance criteria (e.g., "user can reset password via email link").

#### Progress Events

Between sub-steps, the SSE stream emits `finalize_progress` events:

```
event: finalize_progress
data: { "step": "docs"|"card_tests", "step_index": 0, "total_steps": N, "status": "generating"|"complete"|"error", "label": "human-readable description" }
```

The frontend displays these to give the user real-time visibility into finalization progress. If a per-card test call fails, the error is reported but finalization continues with the remaining cards.

### New Action Type: `createContextArtifact`

Current `linkContextArtifact` only links an existing artifact to a card. Finalize mode needs to CREATE artifacts at the project level (some without card links).

```
createContextArtifact:
  target_ref: { project_id: uuid }
  payload: {
    name: string           // artifact name / file path
    type: ArtifactType     // doc | spec | design | test | ...
    title: string | null   // human-readable title
    content: string        // full document/test content
    card_id: string | null // if provided, also link to this card
  }
```

This action:
1. Creates a `ContextArtifact` row in Postgres.
2. If `card_id` is provided, creates a `CardContextArtifact` link.
3. Is validated like all other planning actions (schema validation, referential integrity).

### Phase Complete Event

After all finalize actions are applied:
- `project.finalized_at` is set (project is now finalized; cards can be finalized).
- If repo is connected, root folders from the architectural summary are created in the repo.

```
event: phase_complete
data: { "responseType": "finalize_complete", "artifact_ids": [...] }
```

## Per-Card Finalize Action

### Purpose

After project-wide finalization, each card needs a "last mile" preparation step before build. This assembles the card's full context package and gives the user a final review/edit gate.

### Trigger

User clicks "Finalize" on an individual card in the UI. Only available when:
- Project-wide finalization has completed (project.finalized_at set; project-level context docs exist).
- The card has at least one requirement (draft or approved).
- The card has at least one approved planned file or folder (required; agent may propose folder paths for new builds).

### API Endpoint

```
POST /api/projects/[projectId]/cards/[cardId]/finalize
```

### Behavior

1. **Assemble context**: collect relevant project-wide `ContextArtifact` records for this card:
   - All project-wide docs (architectural summary, data contracts, domain summaries, design system).
   - The workflow summary for this card's workflow.
   - This card's existing `ContextArtifact` links (e2e test, any user-attached context).
2. **Gap analysis** (optional LLM call): if the card's context looks sparse relative to its requirements, the LLM can generate supplementary card-level context (detailed use cases, clarifications).
3. **Return finalization package**: JSON response with all assembled context for the card.
4. **User reviews**: frontend renders the package with edit capabilities.
5. **User confirms**: `POST /api/projects/[projectId]/cards/[cardId]/finalize/confirm`
   - Sets `card.finalized_at` timestamp.
   - Card is now build-ready.

### Card Schema Addition

```sql
ALTER TABLE cards ADD COLUMN finalized_at timestamptz;
```

A card with `finalized_at IS NOT NULL` is build-ready. Build trigger validation checks this and requires approved planned files or folders (no default fallback).

## Decision-Making Principles

1. **Tests are specifications**: e2e tests written during planning express requirements in executable form. They define outcomes, not implementations. This justifies relaxing the "no code" constraint.
2. **Context is curated, not dumped**: the finalize LLM synthesizes project knowledge into focused documents, not raw data exports. Build agents receive oriented briefings, not a search index.
3. **User controls the gate**: every piece of finalization output passes through user review before becoming a build input. The system proposes; the user approves.
4. **Incremental over monolithic**: project-wide finalization runs once; per-card finalization runs per card. This lets users finalize and build cards independently.
5. **Artifacts over ephemeral context**: all finalization outputs are persisted as `ContextArtifact` records. They're auditable, editable, and reusable across builds.

## Priorities (Ordered)

1. Correct and complete project-wide context documents that give build agents enough information to work.
2. High-quality e2e tests that map 1:1 to card requirements and run out of the box.
3. Smooth user review/edit experience for the finalization package.
4. Clean separation between project-level and card-level finalization.
5. Minimal schema and action-type additions to the existing system.

## Risks and Mitigations

### Risk: LLM produces non-runnable test code

- **Mitigation**: finalize prompt includes strict test template with framework imports, describe/test blocks, and assertion patterns. Tests use the existing Playwright test infrastructure.
- **Mitigation**: user review gate catches obvious errors before build.
- **Mitigation**: build-time tester agent can fix/adapt tests if they fail to compile.

### Risk: Project-wide context docs become stale after further planning edits

- **Mitigation**: if the user makes planning changes after finalization, the system flags that project-wide docs may be outdated and offers re-finalization.
- **Mitigation**: per-card finalize always assembles from latest state.

### Risk: Finalize LLM call is expensive (large map state input)

- **Mitigation**: finalize mode receives a summarized map state (titles, descriptions, requirement texts) rather than the full JSON with positions and IDs.
- **Mitigation** (implemented): finalization is fully decomposed into individual LLM calls. Each of the 5 project documents gets its own focused call. Each card's e2e tests get a separate call receiving only that card's data plus a lightweight project summary. The streaming client uses idle-based timeouts (resets on each received chunk) so actively streaming responses are never killed. This prevents timeouts and keeps each call's token usage manageable.

### Risk: createContextArtifact action creates duplicate artifacts on re-finalization

- **Mitigation**: finalize mode uses idempotent artifact naming. Re-finalization upserts by name rather than creating duplicates.
- **Mitigation**: "re-finalize" flow deletes or replaces previous finalization artifacts.

### Risk: E2e tests assume implementation details that haven't been decided yet

- **Mitigation**: prompt instructs LLM to write outcome-based tests only — assert on user-visible behavior, not internal APIs or DOM structure.
- **Mitigation**: tests use data-testid attributes and semantic selectors per Playwright best practices.

## Implementation Sequence

### Step 1: Schema + Types
- Add `test` to `artifactTypeSchema`.
- Add `createContextArtifact` to `planningActionTypeSchema`.
- Add `createContextArtifactPayloadSchema` + `createContextArtifactTargetRefSchema`.
- Add `finalized_at` column to Card schema and database.

### Step 2: Action Handler
- Add `applyCreateContextArtifact` to `apply-action.ts`.
- Add `createContextArtifact` to `action-payloads.ts` maps.
- Add DB mutation handler in `pipelineApply`.

### Step 3: Finalize Prompt
- Add `buildFinalizeSystemPrompt()` to `planning-prompt.ts`.
- Add `buildFinalizeUserMessage()` that serializes summarized map state.
- Prompt structure: project-wide docs first, then per-card tests.

### Step 4: Stream API
- Add `finalize` to `chatStreamRequestSchema.mode` enum.
- Handle `finalize` mode in stream route.
- Emit `finalize_complete` phase event.

### Step 5: Card Finalize Endpoint
- `POST /api/projects/[projectId]/cards/[cardId]/finalize` — assemble context package.
- `POST /api/projects/[projectId]/cards/[cardId]/finalize/confirm` — set finalized_at.
- Validation: require project finalized; require requirements; require at least one approved planned file or folder.

### Step 6: Frontend
- "Finalize Project" button (triggers phase 4).
- Per-card "Finalize" button with review/edit modal.
- Status indicators for finalized vs. not-finalized cards.
- Build trigger gated on `finalized_at`.

### Step 7: Strategy Doc Updates
- Update `dual-llm-integration-strategy.md` with constraint relaxation and finalize phase.
- Update `planning-reference.md` with finalize mode.

## Success Criteria

- Project-wide finalization produces 5 context documents covering architecture, data contracts, domains, workflows, and design system.
- Each card with requirements gets an e2e test file with one test per requirement.
- Users can review and edit all finalization outputs before confirming.
- Confirmed cards are build-ready (finalized_at set; approved planned files/folders required).
- Build trigger rejects cards without finalized_at.

## AI Development Timeline

- Step 1-2 (Schema + Action Handler): ~1-2 hours
- Step 3 (Finalize Prompt): ~1-2 hours
- Step 4 (Stream API): ~30 min
- Step 5 (Card Finalize Endpoint): ~1-2 hours
- Step 6 (Frontend): ~2-4 hours
- Step 7 (Strategy Doc Updates): ~30 min
- Total: ~6-11 hours
