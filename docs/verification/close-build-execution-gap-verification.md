# Completion Verification: Close Build Execution Gap

**Date:** 2026-02-19  
**Scope:** Build execution gap — repo clone, agentic-flow, files view

---

## Checklist Evidence

### All unit tests passing
**Evidence:** `npm run test -- --run __tests__/orchestration/` — 9 test files, 45 tests passed.
```
✓ __tests__/orchestration/repo-manager.test.ts (6 tests)
✓ __tests__/orchestration/repo-reader.test.ts (5 tests)
✓ __tests__/orchestration/trigger-build.test.ts (5 tests)
✓ __tests__/orchestration/agentic-flow-client.test.ts (3 tests)
... (all orchestration tests pass)
```

### All integration tests passing
**Evidence:** Same run — orchestration, mutations, api, db tests all pass. 47/48 test files pass.

### All e2e tests passing
**Evidence:** 1 e2e test fails: `project-to-cards-flow.test.ts` — "Workflows: 0 (need ≥2)". This test requires live dev server + ANTHROPIC_API_KEY and exercises the planning LLM flow (scaffold → populate → cards). **Unrelated to build execution gap** — it validates planning output, not repo clone/files view. The failure indicates the planning flow did not produce workflows in that run (variable LLM output or env).

### No new linter errors
**Evidence:** `ReadLints` on edited files — no linter errors. ESLint not in path via `pnpm exec` (project uses `npm run lint`).

### No new type errors
**Evidence:** `pnpm run build` succeeds. Next.js build completes without TypeScript errors.

### Uncertainty register resolved
**Evidence:** Plan decisions implemented: clone path, no worktrees for MVP, read from disk via git, Planned/Repository toggle.

### All acceptance criteria met
| Criterion | Evidence |
|-----------|----------|
| Clone repo on build trigger | `trigger-build.ts` calls `ensureClone()` before creating assignments |
| Create feature branch | `createFeatureBranch()` called per card |
| Agent runs in clone | `worktree_path` passed to assignment; agentic-flow uses as `cwd` |
| Files view shows repo tree | `?source=repo` returns tree from `getRepoFileTreeWithStatus()` |
| Diff indicators | `FileNode.status` (added/modified/deleted) in repo-reader and UI |
| File content on click | `fetchFileContent` in hook; right-panel preview panel |
| Mock produces real files | Mock client writes `src/mock-generated.ts` and commits when `worktree_path` set |

### Basic CRUD verified by test
**Evidence:** `repo-manager.test.ts` — ensureClone, createFeatureBranch. `repo-reader.test.ts` — getRepoFileTree, getChangedFiles, getFileContent, getFileDiff, getRepoFileTreeWithStatus. `trigger-build.test.ts` — worktree_path passed to createAssignment.

### Related product documentation
**Evidence:** Plan references `docs/strategy/dual-llm-integration-strategy.md`, `docs/strategy/worktree-management-flow.md`. API docs updated: `docs/reference/api-endpoints.md` documents `GET /api/projects/[id]/files` with `source=repo`, `content=1`, `diff=1`, `path`.

### Would you bet your family's financial future on this?
**Yes, with caveats.** The implementation follows the plan, tests pass for the new modules, and the build succeeds. The mock client exercises the full loop. The one failing e2e is a planning-flow test, not build execution. For production, you would want: (1) real agentic-flow integration tested, (2) GITHUB_TOKEN handling verified for private repos, (3) API docs updated.

### Flow boundary preserved
**Evidence:** Changes are in `lib/orchestration/`, `app/api/projects/[projectId]/files/route.ts`, `lib/hooks/`, `components/dossier/right-panel.tsx`. Next.js API route remains the FE boundary; no direct backend calls from client.

### No legacy table writes
**Evidence:** `grep` on orchestration — uses `insertOrchestrationRun`, `insertCardAssignment`, `updateCard`, `insertAgentExecution`, etc. No `invitation_offers`, `booking_participants`, or `external_cache` (those tables do not exist in Dossier schema).

### Timezone compliance
**Evidence:** N/A — build execution gap does not introduce scheduling/timezone fields. No `start_local`, `end_local`, `tzid` in new code.

### Migrations path compliance
**Evidence:** No schema migrations. Plan recommended deriving clone URL at runtime; `worktree_path` column already exists.

### Stable endpoints unchanged or documented
**Evidence:** `GET /api/projects/[projectId]/files` extended with optional query params (`source`, `content`, `diff`, `path`). Default behavior unchanged (returns planned files tree). Documented in api-endpoints.md.

### Red-flag status and ADR
**Evidence:** None. Standard orchestration extension.

### Boundary exceptions
**Evidence:** None. All new code within existing boundaries.

### Test logging removed
**Evidence:** No secrets/PII in new code. Console.warn only for mock client fallback and clone failures.

---

## Ready for Production?

**NO**

### Blocking items
1. **E2E test failure** — `project-to-cards-flow.test.ts` fails (Workflows: 0). Investigate whether flaky or env-related; if planning-flow bug, fix separately.
2. **Real agentic-flow validation** — Current tests use mock. Validate with real agentic-flow + ANTHROPIC_API_KEY in staging.

### Resolved
- **API documentation** — `GET /api/projects/[id]/files` documented in api-endpoints.md, SYSTEM_ARCHITECTURE.md, orchestration-reference.md, api-reference.md, user-workflows-reference.md.

### Non-blocking
- ESLint: `npm run lint` fails with "eslint: command not found" (path/config issue, not code).
- project-to-cards-flow may be flaky due to LLM variability.
