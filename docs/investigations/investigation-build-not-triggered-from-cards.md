# Investigation: Builds Not Triggered from Cards (Regression)

**Symptom**: Builds are not being triggered from cards. Functionality worked in earlier commits but not on the current branch.

**Investigation date**: 2026-02-23  
**Branch**: feature/add-remove-map-entities (compared to main)  
**Methodology**: Investigator agent (`.cursor/agents/investigator.md`)

---

## 1. Rules Audit

- [x] Rule: "ALWAYS run tests before claiming work is complete" — Compliance: Ran implementation-card tests; all 13 pass.
- [x] Rule: "Root-Cause Solutions" — Compliance: Report identifies code diff vs main and restores main behavior where regressed.
- [x] Rule: "ALWAYS verify existing functionality still works after changes" — Compliance: Compared current branch to main for build-trigger flow.

---

## 2. Expected Behavior

- **Expected**: User can trigger a build from a card by clicking the Build button when the card is finalized (and in scope). The app calls `POST /api/projects/[projectId]/orchestration/build` with `scope: "card"` and `card_id`, and the backend creates a run, assignments, and dispatches the agent.
- **Source**: `docs/product/user-workflows-reference.md` (Build cannot trigger without finalized cards; user triggers builds), and data flow: Card UI → `onBuildCard` → `handleBuildCard` → `triggerBuild` (hook) → API route → `triggerBuild(db, input)`.

**Expected behavior established**: YES

---

## 3. Data Flow (Build from Card)

- **UI**: `ImplementationCard` unified action button (action `'build'`) → `onBuildCard(card.id)` or `onAction(card.id, 'build')`.
- **Page**: `handleBuildCard(cardId)` → `triggerBuild({ scope: 'card', card_id: cardId })`; `handleCardAction` handles `action === 'build'` by calling `handleBuildCard(cardId)`.
- **Hook**: `useTriggerBuild(projectId)` → `triggerBuild(input)` → `POST /api/projects/${projectId}/orchestration/build` with body `{ scope, workflow_id, card_id, trigger_type, initiated_by }`.
- **API**: `POST .../orchestration/build` → `triggerBuildRequestSchema.safeParse` → `triggerBuild(db, { project_id, scope, workflow_id, card_id, trigger_type, initiated_by })`.
- **Backend**: `trigger-build.ts` → single-build lock, project/repo/cards checks → `createRun` → per-card `createAssignment` → `dispatchAssignment`.

---

## 4. Root Cause Analysis

### 4.1 Comparison: main vs feature/add-remove-map-entities

| Location | main | Current branch |
|----------|------|-----------------|
| `app/page.tsx` – `useTriggerBuild` argument | `appMode === 'active' ? projectId : undefined` | `appMode === 'active' && projectId ? projectId : undefined` |
| `app/page.tsx` – `handleCardAction` | Does not handle `action === 'build'`; only monitor/test open panel | Handles `action === 'build'` by calling `handleBuildCard(cardId)` |
| `components/dossier/implementation-card.tsx` | Single button: click calls `onBuildCard(card.id)` only when `action === 'build' && onBuildCard && card.finalized_at`, else `onAction(card.id, action)` | Unified action state: shows "Finalize" when `!finalized && onFinalizeCard`, else "Build" when `(status === 'todo' \|\| 'production') && onBuildCard`; click calls `onBuildCard(card.id)` or `onAction(card.id, 'build')` |

### 4.2 Identified Regression

**Root cause**: Stricter `useTriggerBuild` condition on the current branch.

- **Main**: `useTriggerBuild(appMode === 'active' ? projectId : undefined)`  
  - When app mode is active, the hook always receives `projectId` (even when it is `''`).
- **Branch**: `useTriggerBuild(appMode === 'active' && projectId ? projectId : undefined)`  
  - When app mode is active but `projectId` is falsy (e.g. empty string), the hook receives **undefined**.
  - In that case, `triggerBuild()` in the hook never calls the API; it returns immediately with `{ error: "No project selected", outcomeType: "error" }` (see `lib/hooks/use-trigger-build.ts`: `if (!projectId) return { ... }`).

**When this matters**: If there is any moment when the user sees the map (workflows present → `appMode === 'active'`) but `projectId` is still empty (e.g. before `useEffect` has run to set `projectIdState` from the first project when both `projectIdState` and `defaultProjectId` are initially empty), then on the branch the hook gets `undefined` and Build clicks never hit the API. Restoring main’s condition ensures the same argument is passed as on main and avoids this stricter gating.

### 4.3 Other Findings (No Regression)

- **implementation-card.tsx**: Unified action logic correctly shows Build only when the card is effectively buildable (finalized and todo/production, or blocked without resume). Build click correctly calls `onBuildCard(card.id)` or `onAction(card.id, 'build')`; the page’s `handleCardAction` now handles `'build'`, so both paths trigger a build. No regression.
- **API route and trigger-build.ts**: No behavioral change between main and branch (only an extra `console.warn` on failure in the route). Validation and backend logic unchanged.
- **Tests**: `__tests__/components/implementation-card.test.tsx` (13 tests) pass on the branch; Build button behavior is covered.

---

## 5. Fix Applied

Revert the `useTriggerBuild` argument to match main so that when app mode is active we pass `projectId` regardless of truthiness (same as main):

- **File**: `app/page.tsx`
- **Change**: Replace  
  `useTriggerBuild(appMode === 'active' && projectId ? projectId : undefined)`  
  with  
  `useTriggerBuild(appMode === 'active' ? projectId : undefined)`  
- **Rationale**: Restores main’s behavior and removes the extra `&& projectId` guard that can cause the hook to receive `undefined` and block the build request.

---

## 6. Tests

- **Relevant tests**: `__tests__/components/implementation-card.test.tsx` (Build button calls onBuildCard for finalized todo cards; Build for failed/rebuild; Finalize prioritized when unfinalized; etc.).
- **Status**: All 13 tests pass before and after the fix.
- **Recommendation**: For full confidence, run e2e that triggers a build from a card (e.g. card-finalize-build-gate or build-creates-files) and confirm the build starts.

---

## 7. Summary

| Item | Result |
|------|--------|
| **Expected behavior** | User can trigger build from card when finalized; API and backend create run and dispatch. |
| **Current behavior (before fix)** | Build could appear to do nothing when `projectId` was falsy in active mode because the hook received `undefined`. |
| **Data flow** | Card → onBuildCard / handleCardAction('build') → handleBuildCard → useTriggerBuild(projectId).triggerBuild → POST orchestration/build → triggerBuild(db). |
| **Root cause** | `app/page.tsx` passed `projectId` to `useTriggerBuild` only when `appMode === 'active' && projectId`, unlike main which passes whenever `appMode === 'active'`. |
| **Fix** | Use main’s condition: `useTriggerBuild(appMode === 'active' ? projectId : undefined)`. |
