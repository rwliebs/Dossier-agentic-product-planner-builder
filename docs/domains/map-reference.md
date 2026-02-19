---
document_id: doc.map
last_verified: 2026-02-18
tokens_estimate: 550
tags:
  - map
  - snapshot
  - story-map
anchors:
  - id: contract
    summary: "Map = Project + Workflow→Activity→Step→Card tree; PlanningState in memory"
  - id: build
    summary: "fetchMapSnapshot → PlanningState; buildMapTree → nested API response"
  - id: queries
    summary: "getWorkflowsByProject, getActivitiesByProject, getCardsByProject"
ttl_expires_on: null
---
# Map Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [data-contracts-reference.md](data-contracts-reference.md)

## Contract

### Invariants
- INVARIANT: Map structure: Project → Workflow[] → WorkflowActivity[] → Step[] → Card[]
- INVARIANT: Cards belong to activity; optionally to step (step_id)
- INVARIANT: PlanningState uses Map<string, Entity> for O(1) lookup during validation

### Boundaries
- ALLOWED: fetchMapSnapshot, buildMapTree; queries via DbAdapter
- FORBIDDEN: Building map from ad-hoc queries; bypassing PlanningState shape

---

## Implementation

### Data Shape
- **PlanningState**: In-memory; used by validate-action, apply-action, chat
- **Map API response**: Nested tree for UI; `workflows[].activities[].steps[].cards` + activity-level cards

### Build Flow
```
GET /api/projects/[id]/map
  → fetchMapSnapshot(db, projectId)
  → getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject, getArtifactsByProject, getCardContextLinksByProject
  → createEmptyPlanningState + populate Maps
  → buildMapTree(state) → nested JSON
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/supabase/map-snapshot.ts` | fetchMapSnapshot, buildMapTree |
| `lib/schemas/planning-state.ts` | PlanningState interface, createEmptyPlanningState |
| `lib/supabase/queries.ts` | getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject |
| `lib/supabase/queries/workflows.ts` | Workflow + activity + step tree queries |
| `app/api/projects/[id]/map/route.ts` | Map endpoint |

### Tree Structure
- Workflows ordered by position
- Activities ordered by position within workflow
- Steps ordered by position within activity
- Cards: step-scoped (step_id) or activity-level (step_id null)

---

## Verification
- [ ] Map snapshot matches DB state after actions applied
- [ ] buildMapTree produces valid nested structure for UI
- [ ] PlanningState sufficient for validate-action refs

## Related
- [mutation-reference.md](mutation-reference.md)
- [planning-reference.md](planning-reference.md)
