# Finalization Phase Strategy

## Purpose

Define the design for project finalization (core product documents + directory structure) and per-card finalization (review and build gate). This document supplements [dual-llm-integration-strategy.md](./dual-llm-integration-strategy.md) and is the source of truth for finalization-phase decisions.

## User Flow (Canonical)

1. **User prompts the planner agent with an idea**
2. **Agent follows up with questions if needed**
3. **Agent populates project header details and workflows** (scaffold: `updateProject` + `createWorkflow`)
4. **User must finalize project** — Creates core product documents (architecture plan, design system, data contracts, domain summaries, workflow summaries) and directory folders in the repo. The planner agent will have everything needed to create accurate user steps (activities) and functionality cards when populating workflows.
5. **User populates workflows one at a time** — No bulk "accept" step that finalizes everything at once (too large a task). User selects a workflow; planner populates activities and cards. As cards are created, the planner agent proposes code files and attaches/creates context docs and tests, respecting the overall app design.
6. **User reviews, finalizes and builds cards one by one** (for MVP) — Per-card finalize assembles context; user reviews; build triggers execution agent with explicit file scope.

## Product Goal

1. Project finalization produces core product documents and directory structure so the planner can propose accurate, design-consistent code files when populating workflows.
2. Workflow population is incremental (one workflow at a time); planner proposes planned files, context docs, and tests per card.
3. Per-card finalize gives the user a review gate before build; build receives explicit file scope from approved planned files/folders.

## Planning Pipeline

| Phase | Mode | Trigger | Output |
|-------|------|---------|--------|
| 1. Idea | `scaffold` | User submits idea | `updateProject` + `createWorkflow` |
| 2. Project Finalize | `finalize` | User clicks "Finalize Project" (after workflows exist) | Core product docs + directory folders; `project.finalized_at` set |
| 3. Workflow Population | `populate` | User selects one workflow at a time | `createActivity` + `createCard` + `upsertCardPlannedFile` + context docs + tests per card |
| 4. Card Finalize + Build | per-card | User finalizes and builds cards one by one | `card.finalized_at` set; build dispatches with explicit file scope |

**Constraint**: Remove the bulk "accept" step in chat that populates all workflows at once. Workflow population must be one workflow at a time.

## Strategy Constraint Updates

### Test Code in Planning

Planning LLM outputs PlanningAction[] only; never production/implementation code. **Exception**: populate mode (and optionally per-card finalize) may produce e2e test code as `ContextArtifact` content with `type: 'test'`. This is permitted because:

- Tests are executable specifications of requirements, not implementation code.
- They define "what must be true" without prescribing "how to build it."
- Build agents use them as acceptance gates, not as implementation guidance.
- The user reviews and can edit tests before they become build inputs.

### No Test Artifacts in CardPlannedFile

`CardPlannedFile.artifact_kind` must not include test artifacts. Tests live as `ContextArtifact` records with `type: 'test'`, linked to cards via `CardContextArtifact`. This keeps the planned-file schema focused on implementation artifacts and avoids conflating "what to build" with "how to verify."

## Project-Wide Finalization

### Trigger

User clicks "Finalize Project" in the UI after the planner has populated project header details and workflows (scaffold complete). The system validates that workflows exist before allowing finalization. Cards may not exist yet — project finalization establishes the foundation so the planner can propose accurate code files when populating workflows.

### LLM Mode: `finalize` (Multi-Step)

Finalize mode runs multiple LLM calls in parallel (one per document). Each sub-step has its own focused prompt. Parallel execution reduces total latency vs sequential.

**One prompt for multiple docs?** A single prompt could produce all 5 docs in one response, reducing input tokens (state sent once) and enabling holistic cross-doc consistency. Trade-off: output size increases (5 docs in one JSON), raising timeout risk and potential quality degradation toward the end of long generations. If parallel still times out, consider batching (e.g. 2–3 docs per call) or a single holistic prompt with concise-output guidance.

#### Sub-steps 1–5: Core Product Documents (1 LLM call each, run in parallel)

Each document gets its own LLM call. The five categories of project-level `ContextArtifact` records:

| Document | Artifact Type | Content |
|----------|--------------|---------|
| Architectural Summary | `doc` | Tech stack, service topology, key patterns, deployment model; MUST include "## Root folder structure" with bullet list of paths (e.g. app/, components/, lib/) |
| Data Contracts | `spec` | Schemas, API contracts, shared interfaces, data flow |
| Domain Summaries | `doc` | Bounded contexts, domain models, entity relationships, glossary |
| User Workflow Summaries | `doc` | Per-workflow: user outcomes, activity flow, card dependencies, cross-workflow connections |
| Design System | `design` | Component palette, color tokens, typography, spacing conventions, interaction patterns |

Each document is derived from the current map state: project metadata (tech_stack, deployment, design_inspiration, customer_personas), workflow/activity titles and descriptions. Cards may be absent at this stage.

#### Directory Folders

After documents are created, the system parses the "## Root folder structure" section from the Architectural Summary and creates those folders in the repo (with `.gitkeep`). If no repo is connected, folder creation is skipped; folders are created when the repo is linked and project is re-finalized, or on first build.

#### Progress Events

The SSE stream emits `finalize_progress` events between sub-steps. The frontend displays these for real-time visibility.

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

## Workflow Population (Incremental)

### One Workflow at a Time

**Constraint**: Remove the bulk "accept" step in chat that populates all workflows at once. That task is too large and leads to timeouts or low-quality output.

User selects a single workflow; planner populates it with activities and cards. As cards are created, the planner agent:

- Proposes code files (`upsertCardPlannedFile`) — specific files or folder paths where files should go
- Attaches or creates context docs (`createContextArtifact`, `linkContextArtifact`)
- Creates e2e tests (`createContextArtifact` with `type: 'test'`)

All proposals respect the overall app design established at project finalization (architecture, design system, data contracts).

### Per-Card E2E Tests

E2e tests are created during workflow population (populate mode), not during project finalization. When the planner creates a card with requirements, it generates a `ContextArtifact` with `type: 'test'` and links it to the card. Test guidelines:

- Outcome-based: each test validates that a requirement is realized.
- One test per requirement.
- Framework: Playwright.
- Self-contained; descriptive names.

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

1. **Project first, then cards**: Project finalization creates the foundation (docs + folders). The planner uses that foundation to propose accurate, design-consistent code files when populating workflows.
2. **Incremental workflow population**: One workflow at a time. No bulk "accept" that populates everything at once — too large a task, leads to timeouts and low quality.
3. **Tests are specifications**: e2e tests written during populate express requirements in executable form. They define outcomes, not implementations.
4. **Context is curated, not dumped**: Project finalize synthesizes project knowledge into focused documents. Build agents receive oriented briefings, not a search index.
5. **User controls the gate**: Every piece of finalization output passes through user review. Per-card finalize and build happen one by one for MVP.
6. **Artifacts over ephemeral context**: All outputs are persisted as `ContextArtifact` records. Auditable, editable, reusable.

## Priorities (Ordered)

1. Project finalization produces core product documents and directory structure before workflow population.
2. Workflow population is incremental (one workflow at a time); remove bulk accept.
3. Planner proposes planned files, context docs, and tests per card during populate, respecting app design.
4. Per-card finalize and build one by one for MVP.
5. Clean separation between project-level and card-level finalization.

## Implementation Notes

- **Remove bulk accept**: The chat flow must not offer a single "accept" that populates all empty workflows at once. Ensure populate is scoped to one workflow per request (`populate` + `workflow_id`). If the UI or prompts suggest "populate all workflows," remove or replace with "populate this workflow."

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
- **Mitigation**: Re-finalize flow deletes or replaces existing finalization artifacts.

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

- Project finalization produces 5 core product documents and creates directory folders in the repo.
- Project finalization completes before workflow population (or at least before cards can be finalized).
- Workflow population is one workflow at a time; no bulk accept that populates all workflows at once.
- As cards are created during populate, planner proposes planned files, context docs, and e2e tests respecting app design.
- Per-card finalize assembles context; user reviews; build receives explicit file scope.
- Confirmed cards are build-ready (finalized_at set; approved planned files/folders required).

## AI Development Timeline

- Step 1-2 (Schema + Action Handler): ~1-2 hours
- Step 3 (Finalize Prompt): ~1-2 hours
- Step 4 (Stream API): ~30 min
- Step 5 (Card Finalize Endpoint): ~1-2 hours
- Step 6 (Frontend): ~2-4 hours
- Step 7 (Strategy Doc Updates): ~30 min
- Total: ~6-11 hours
