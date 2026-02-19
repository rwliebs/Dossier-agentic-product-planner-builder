# Investigation Report: MapleTCG Project Data Not Visible in View Pane

**Investigation ID:** INV-002  
**Date:** 2026-02-18  
**Status:** Root cause identified

---

## 1. Rules Audit

- [ ] **Cursor AI Rules (repo_specific_rule):** None found (no `.cursorrules`, `AGENTS.md`, or `.cursor/rules/` in repo)
- [ ] **Mode-specific rules:** Investigator protocol — trace data flow, identify root cause, set success criteria
- [ ] **Compliance:** Followed protocol: rules audit, expected behavior, data flow, root cause, tests, report

---

## 2. Expected Behavior

| Expected Behavior | Source |
|-------------------|--------|
| User sees project data (name, description), workflows, activities, and cards in the view pane when viewing a project | User expectation from bug report |
| When workflows exist but have no activities, user sees project name, scaffolded workflow titles, and guidance to populate | `__tests__/components/workflow-block.test.tsx` (lines 97–121) |
| Map snapshot path: `GET /api/projects/[id]/map` → DbAdapter → Project + Workflow[] + Activity[] + Card[] | `docs/SYSTEM_ARCHITECTURE.md` (lines 86–89) |

**Expected behavior established:** YES

---

## 3. Root Cause Analysis

### 3.1 Data Flow Investigation

**Retrieval flow (Map Snapshot):**
```
[UI: page.tsx] 
  → useMapSnapshot(projectId) 
  → GET /api/projects/[projectId]/map 
  → getDb() → SQLite adapter 
  → getProject, getWorkflowsByProject, getActivitiesByProject, getCardsByProject 
  → build map tree (workflowsWithTree) 
  → JSON snapshot 
  → [Frontend: WorkflowBlock] 
  → [StoryMapCanvas or ArchitectureView] 
  → [UI: workflow titles, activity columns, cards]
```

**MapleTCG DB state (verified via SQLite):**
- Project: `d47670b9-5e07-452b-9650-f08bfa056ef8`, name "MapleTCG"
- Workflows: 11
- Activities: 0
- Cards: 0

### 3.2 Uncertainty Register

**KNOWN:**
- MapleTCG exists in DB with 11 workflows, 0 activities, 0 cards
- API route correctly returns project + workflows with empty activities arrays
- `StoryMapCanvas` has two branches: `workflowsWithNoActivities` (all workflows have 0 activities) vs. normal (at least one workflow has activities)
- In `workflowsWithNoActivities` branch: workflow titles are shown; project name appears in WorkflowBlock header; project description is only in LeftSidebar
- "Your Request" banner shows `project.name` (e.g. "MapleTCG"), not project description

**UNKNOWN:** Resolved — see root cause below.

**ASSUMED:** User considers the main center canvas the "view pane"; left sidebar may be collapsed or overlooked.

**Status:** CLEAR

### 3.3 Bug Verification

**Bug verified:** YES — user sees workflow titles but reports not seeing "project data" (description, activities, cards).

### 3.4 Technical Investigation

1. **Project description placement:** Project description ("A Canadian marketplace...") is only rendered in `LeftSidebar` (lines 636–640). The main view pane (WorkflowBlock + StoryMapCanvas) does **not** display project description. If the sidebar is collapsed or the user expects project info in the center, they will not see it.

2. **Workflows-only state:** When all workflows have 0 activities, `StoryMapCanvas` uses the `workflowsWithNoActivities` branch (lines 47–78). This shows:
   - Workflow titles (muted, `text-xs font-mono text-muted-foreground uppercase`)
   - Empty dashed placeholders ("—")
   - Guidance: "Workflows are scaffolded — use the Agent chat to populate them with activities and cards" and "Accept the pending preview in the chat panel to continue"
   - Project name appears in WorkflowBlock header (`snapshot.project.name`) but is small (`text-xs text-muted-foreground`)

3. **Activities/cards:** With 0 activities and 0 cards in DB, the UI correctly shows an empty state. There is no data to display.

4. **Project selection:** Project ID comes from `localStorage` (`dossier_project_id`), `NEXT_PUBLIC_DEFAULT_PROJECT_ID`, or first project in list. If MapleTCG is selected, the correct data is fetched.

### 3.5 Root Cause Analysis

#### 3.5.1 Behaviors

| Current behavior | Source | Expected behavior |
|------------------|--------|-------------------|
| Project description only in left sidebar; not in main view pane | `components/dossier/left-sidebar.tsx` 636–640 | User expects project data (including description) visible in the view pane |
| Main view shows workflow titles + empty placeholders when 0 activities | `components/dossier/story-map-canvas.tsx` 47–78 | User expects to see project info and clear next steps |
| Project name in WorkflowBlock header is subtle (text-xs, muted) | `components/dossier/workflow-block.tsx` 75 | Project identity should be prominent in view pane |

#### 3.5.2 Root Cause (5 Whys)

1. **Why** does the user not see project data? → Project description and prominent project context are not shown in the main view pane.
2. **Why** is project description not in the view pane? → It is only rendered in the left sidebar.
3. **Why** only in the sidebar? → Design decision: project header (name, description) was placed in the sidebar; main canvas focused on workflows/activities/cards.
4. **Why** does the user expect it in the view pane? → The "view pane" is the main center area; users naturally look there for project context. With 0 activities/cards, the canvas shows only workflow titles and guidance, so project description feels missing.
5. **Why** does the empty state feel incomplete? → No project-level summary (description) in the main view; workflow titles are muted; guidance assumes a pending preview that may not exist.

**Root cause:** Project description and prominent project context are not displayed in the main view pane. They exist only in the left sidebar, which may be collapsed or overlooked. For projects with workflows but no activities (scaffolded state), the main view shows workflow titles and guidance but no project-level summary, leading users to report they "cannot see" project data.

**Alternatives considered:**
- Add project description and summary to the WorkflowBlock header or a banner above the canvas.
- Add a project info section at the top of the StoryMapCanvas when `workflowsWithNoActivities`.
- Improve empty-state copy to explicitly mention project name and description location.

---

## 4. Test-Driven Development

### 4.1 Current Test Coverage

| Test name | File | Current result | Coverage | Test issues |
|-----------|------|----------------|-----------|-------------|
| WorkflowBlock workflows-only | `__tests__/components/workflow-block.test.tsx` | Pass | Workflows-only snapshot | Expects project name, workflow titles, guidance; does not assert project description in view |
| useMapSnapshot | `__tests__/hooks/use-map-snapshot.test.ts` | Pass | Hook behavior | N/A |

**Test applicable:** YES — existing test covers workflows-only rendering but does not assert project description visibility in the main view.

**Recommendation:** Add or extend tests to assert that project description (or a project summary) is visible in the main view pane when workflows exist but have no activities.

---

## 5. Investigation Report Summary

| Field | Value |
|-------|-------|
| **Expected behavior** | User sees project data (name, description), workflows, activities, and cards in the view pane. For scaffolded projects (0 activities), user sees project context and clear guidance. |
| **Current behavior** | User sees workflow titles and empty placeholders in the main view; project description is only in the left sidebar; project name in header is subtle. |
| **Data flow** | `GET /api/projects/[id]/map` → SQLite → build map tree → `useMapSnapshot` → `WorkflowBlock` → `StoryMapCanvas`. Data flow is correct; MapleTCG returns 11 workflows, 0 activities, 0 cards. |
| **Root cause** | Project description and prominent project context are not displayed in the main view pane; they exist only in the left sidebar. For scaffolded projects, the main view lacks project-level summary. |
| **Source** | `components/dossier/left-sidebar.tsx` (project description), `components/dossier/workflow-block.tsx` (project name only), `components/dossier/story-map-canvas.tsx` (workflowsWithNoActivities branch) |
| **Tests** | `__tests__/components/workflow-block.test.tsx` — extend to assert project description or summary in main view |

---

## 6. Success Criteria for Fix

1. **Project description visible in view pane:** When viewing a project with a description, the description (or a truncated summary) is visible in the main view pane, not only in the left sidebar.
2. **Project context prominent:** Project name and/or description are clearly visible in the main canvas area when workflows exist (including scaffolded state).
3. **Scaffolded state clarity:** When workflows exist but have 0 activities, the empty state includes project context (name, description) and clear next steps.

---

## 7. Recommended Fix Approach

1. **Add project summary to WorkflowBlock header** (or banner above canvas): Display project description (or first ~100 chars) alongside project name when `snapshot.project.description` is present. This keeps project context in the main view.
2. **Enhance `workflowsWithNoActivities` branch:** Add a project summary block (name + description) at the top of the scaffolded workflows view, before the workflow list. This addresses the "I cannot see any of those" feedback by surfacing project info in the main view.
3. **Optional:** Increase prominence of project name in WorkflowBlock header (e.g. larger font, less muted) when in scaffolded state.
4. **Regression:** Ensure left sidebar continues to show full project name and description for editing.

---

## 8. Related Issues

- **ArchitectureView `act.steps`:** `architecture-view.tsx` line 20 and `page.tsx` line 89 reference `act.steps`, but the Map API returns activities with `cards` only (no `steps`). Migration `005_remove_steps.sql` removed steps. This is a latent bug: switching to Architecture view with activities would throw `TypeError: Cannot read property 'flatMap' of undefined`. Fix: use `(act.steps ?? []).flatMap(...)` or remove steps from the data model consistently.
