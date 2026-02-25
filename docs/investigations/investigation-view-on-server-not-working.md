# Investigation: View on server function doesn't appear to be working

**Date**: 2026-02-24  
**Status**: Root cause identified  
**Reporter**: User  
**Investigator**: Agent (investigator process)

---

## 1. Rules Audit

- [x] Rule: Cursor AI Safety — verify feature boundaries, no pattern mixing
- [x] Compliance: Investigation is read-only; no code changes
- [x] Rule: Use SYSTEM_ARCHITECTURE and code for data flow
- [x] Compliance: Data flow mapped from UI → API → script

---

## 2. Expected Behavior

| Expected behavior | Source |
|------------------|--------|
| User can "optionally run full app locally (clone path in ~/.dossier/repos/<projectId>/) to verify behavior" | `docs/product/user-workflows-reference.md` (step 3, workflow 4) |
| "View on server" starts a dev server for the **project's built product** (the repo clone) and opens it in a browser | Inferred from workflow: review produced code → run app locally |
| Clicking a frontend file shows HTML preview on local server | Same workflow doc |

**Expected behavior established**: YES

---

## 3. Data Flow Investigation

### 3.1 Current data flow

- **UI**: `components/dossier/workflow-block.tsx` — "View on server" button → `handleViewOnServer()` → `POST /api/dev/restart-and-open` (no body, no projectId).
- **API**: `app/api/dev/restart-and-open/route.ts` — In development only:
  1. `process.cwd()` → Dossier app root (e.g. `/Users/richardliebrecht/Dossier`).
  2. Find free port in 3001–3010.
  3. Run bash: `cd "<root>" && PORT=${port} nohup npm run dev ... &` then `sleep 10` then `open "http://localhost:${port}"`.
- **Result**: A **second instance of the Dossier Next.js app** is started on 3001 (or next free port), and the browser opens that. The user’s **project repo** (e.g. `~/.dossier/repos/<projectId>/`) is never used.

### 3.2 Intended data flow (from architecture)

- **Retrieval of clone path**: `lib/orchestration/repo-manager.ts` → `getClonePath(projectId)` → `~/.dossier/repos/<projectId>/`.
- **Intended**: "View on server" should run a dev server **inside the project clone** and open that app in the browser, not the Dossier app again.

---

## 4. Uncertainty Register

**KNOWN**:
- `snapshot.project.id` is available in `WorkflowBlock` (`MapSnapshot.project.id` in `lib/types/ui.ts`).
- Clone path is `getClonePath(projectId)` = `~/.dossier/repos/<projectId>/` (repo-manager).
- API uses `process.cwd()` and does not accept or use `projectId`.
- API runs `npm run dev` in Dossier root; project clone is never referenced.

**UNKNOWN**:
- Whether the project clone always has `npm run dev` (stack-dependent; acceptable default).
- Whether `ensureClone` has been run before "View on server" (clone may not exist yet).

**ASSUMED**: None blocking.

**Status**: CLEAR

---

## 5. Bug Verification

**Bug verified**: YES

- Current behavior: Starting dev server in Dossier root and opening that URL.
- Expected behavior: Start dev server in project clone and open that URL.
- The button “doesn’t appear to be working” from the user’s perspective because either:
  1. They see another Dossier UI (wrong app), or  
  2. They expect to see their project app and never do.

---

## 6. Root Cause Analysis

### 6.1 Behaviors

| # | Current behavior | Source | Expected behavior |
|---|------------------|--------|--------------------|
| 1 | POST /api/dev/restart-and-open is called with no body | `workflow-block.tsx` L160 | API should receive projectId so it can run the server in the project clone |
| 2 | API uses `process.cwd()` as the directory for `npm run dev` | `route.ts` L39, L49 | API should use clone path `~/.dossier/repos/<projectId>/` (or equivalent via `getClonePath(projectId)`) |
| 3 | A second Dossier app starts on 3001+ and the browser opens it | `route.ts` L49–52 | The **project’s** app (from the clone) should start and open |

### 6.2 Why (5 Whys)

1. **Why doesn’t “View on server” show the project app?**  
   Because the server that is started is the Dossier app, not the project app.

2. **Why is the Dossier app started?**  
   Because the API runs `npm run dev` in `process.cwd()`, which is the Dossier app root.

3. **Why does the API use the Dossier root?**  
   Because the route was implemented without project context and uses only `process.cwd()`.

4. **Why is there no project context?**  
   Because the frontend does not send `projectId`, and the API has no parameter or body to receive it.

5. **Why was it implemented that way?**  
   Design/oversight: the “run project app in clone” requirement (user-workflows-reference) was not reflected in the restart-and-open implementation.

### 6.3 Root cause (concise)

- **Root cause**: The “View on server” flow starts a dev server in the **Dossier application root** instead of in the **project’s clone** (`~/.dossier/repos/<projectId>/`), and the API does not receive or use `projectId`.
- **Source**: `app/api/dev/restart-and-open/route.ts` (use of `process.cwd()` and no projectId); `components/dossier/workflow-block.tsx` (no projectId sent to the API).

### 6.4 Alternatives considered

- **A**: Pass `projectId` from the UI, resolve clone path on the server with `getClonePath(projectId)`, run `npm run dev` (or a configurable script) in that directory. **Chosen direction.**
- **B**: Keep current behavior and rename the button (e.g. “Open second Dossier instance”). Rejected: conflicts with documented user workflow.
- **C**: Open the clone path in the OS file manager or IDE instead of starting a server. Different feature; does not replace “run full app locally.”

---

## 7. Test Coverage

- No tests found that target `restart-and-open` or “View on server” behavior.
- **Recommendation**: Add an API test (or integration test) that, given a projectId, asserts the server runs from the clone path (e.g. mock or env with a test clone path), and optionally a UI test that the button sends `projectId` in the request.

---

## 8. Report Summary (for fixer)

| Item | Value |
|------|--------|
| **Expected behavior** | User clicks “View on server” → dev server for the **project repo** (clone at ~/.dossier/repos/<projectId>/) starts → browser opens that app. |
| **Current behavior** | Dev server for the **Dossier app** starts in `process.cwd()`; browser opens that (e.g. second Dossier on 3001). |
| **Data flow** | UI (`workflow-block.tsx`) → `POST /api/dev/restart-and-open` (no body) → API runs `npm run dev` in `process.cwd()` → wrong app. |
| **Root cause** | (1) API does not accept or use `projectId`. (2) API uses Dossier root instead of project clone path from `getClonePath(projectId)`. |
| **Source** | `app/api/dev/restart-and-open/route.ts` (lines 39, 49–52); `components/dossier/workflow-block.tsx` (lines 157–174, no projectId in fetch). |
| **Tests** | None today; recommend adding API (and optionally UI) tests as above. |

### Fix direction (implementation guidance)

1. **Frontend**: In `workflow-block.tsx`, pass the current project id in the request (e.g. `snapshot.project.id`). Send it as JSON body: `POST /api/dev/restart-and-open` with `{ projectId: snapshot.project.id }`.
2. **Backend**: In `app/api/dev/restart-and-open/route.ts`:
   - Parse body for `projectId` (required when implementing “view project app”).
   - Resolve clone path with `getClonePath(projectId)` from `lib/orchestration/repo-manager.ts`.
   - If the clone directory does not exist, return a 400/409 with a message like “Project repo not cloned yet; run a build first” (or trigger ensureClone if that is desired).
   - Run the dev server command in the **clone path** (e.g. `cd "<clonePath>" && PORT=${port} nohup npm run dev ...`), not in `process.cwd()`.
3. **Edge cases**: Handle missing clone (no build yet), invalid projectId, and port range 3001–3010 full (already implemented). Optionally detect package manager (npm/pnpm/yarn) in the clone for the run command.

---

*End of investigation report.*
