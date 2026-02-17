---
name: Step 5 Frontend Canonical Migration
overview: Replace prototype types with canonical Zod-derived types end-to-end. Wire UI components to live Supabase data via hooks. Remove map-adapter bridge. Add project selection.
todos:
  - id: hooks-layer
    content: Create data-fetching hooks in lib/hooks/ (useProject, useMapSnapshot, useSubmitAction, useKnowledgeItems, usePlannedFiles, useArtifacts)
    status: completed
  - id: canonical-ui-types
    content: Create UI-facing type re-exports from canonical Zod schemas and deprecate components/dossier/types.ts
    status: completed
  - id: migrate-canvas-components
    content: Migrate IterationBlock, EpicRow, ActivityColumn, StoryMapCanvas from prototype types to Workflow/WorkflowActivity/Step
    status: completed
  - id: migrate-card-component
    content: Migrate ImplementationCard to canonical Card props with planned-file and knowledge-item sections including status badges
    status: completed
  - id: migrate-right-panel
    content: Replace mock file trees in RightPanel with live data and remove hardcoded terminal output
    status: completed
  - id: migrate-page-state
    content: Replace page.tsx state management with canonical reducer/hooks and remove mapSnapshotToIterations adapter
    status: completed
  - id: project-selection
    content: Add project creation/selection flow with list, create, and active project management
    status: completed
  - id: smoke-tests-update
    content: Update existing component smoke tests and add new tests for migrated props
    status: completed
isProject: false
---

# Step 5: Frontend Canonical Migration

## Context

Steps 2-4 are complete: canonical Zod schemas exist in `lib/schemas/`, Supabase tables are deployed, and full API routes exist under `app/api/projects/`. The frontend still uses prototype types (`Epic`, `UserActivity`, `Iteration`) from `components/dossier/types.ts` with a bridge adapter in `lib/map-adapter.ts`.

## Type Mapping


| Prototype              | Canonical         | Notes                                        |
| ---------------------- | ----------------- | -------------------------------------------- |
| Iteration              | Removed           | Content becomes Project + workflow tree      |
| Epic                   | Workflow          | Children: WorkflowActivity[]                 |
| UserActivity           | WorkflowActivity  | Children: Step[] then Card[]                 |
| (none)                 | Step              | New layer between activity and card          |
| Card                   | Card              | Adds step_id, build_state; drops testFileIds |
| ContextDoc             | ContextArtifact   | Expanded type enum, adds uri/locator         |
| KnownFact              | CardKnownFact     | Adds status, source, confidence              |
| Assumption             | CardAssumption    | Same enrichment                              |
| Question               | CardQuestion      | Same enrichment                              |
| requirements: string[] | CardRequirement[] | Structured with status/source                |
| (none)                 | CardPlannedFile   | New: MVP architecture checkpoint             |


## Task Details

### hooks-layer

Create `lib/hooks/` with React hooks wrapping API calls. Each returns `{ data, loading, error, refetch }`. Uses canonical types from `lib/schemas/`.

### canonical-ui-types

Create `lib/types/ui.ts` re-exporting canonical types. Add UI-only computed types if needed (e.g. CardWithKnowledge). Update all component imports.

### migrate-canvas-components

Replace IterationBlock with WorkflowBlock receiving Workflow + children. Update hierarchy: page.tsx -> WorkflowBlock -> WorkflowRow -> ActivityColumn -> StepGroup -> ImplementationCard.

### migrate-card-component

Card sections: Requirements (with status badges), Context Artifacts, Planned Files (with approval actions), Known Facts, Assumptions, Questions. Knowledge items show draft/approved/rejected badges.

### migrate-right-panel

Replace mockFileTree with live project data. Replace hardcoded terminalLines with real data when available. Docs tab renders ContextArtifact content.

### migrate-page-state

Use useMapSnapshot(projectId) hook returning canonical PlanningState. Wire mutations through useSubmitAction(). Clean up projectContext to derive from real data.

### project-selection

Minimal project management: list/selector, create project form, selected project in URL param or localStorage. NEXT_PUBLIC_DEFAULT_PROJECT_ID remains as fallback.

### smoke-tests-update

Update implementation-card.test.tsx and header.test.tsx with canonical props. Add tests for new components and hook behavior.

## Exit Criteria

- components/dossier/types.ts deleted or contains only UI-only helpers
- lib/map-adapter.ts deleted
- All 13 components compile with canonical types
- Page refresh retains state
- All component smoke tests pass

## Estimate: 4-5 AI dev days

