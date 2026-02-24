# Investigation: Card Build Produces Only README — No Real Code Files

**Symptom**: When a user triggers a build for a project card (e.g. "DISPLAY MAP VIEW OF NEARBY PARTIES"), the repository file directory in the UI shows only a README file — no actual code files.

**Investigation date**: 2026-02-23
**Investigator**: AI agent (investigator methodology)

---

## 1. Rules Audit

- [x] Rule: "ALWAYS run tests before claiming work is complete"
  - Compliance: Ran all 42 orchestration tests — all pass.
- [x] Rule: "Root-Cause Solutions: Implement fixes that resolve underlying issues"
  - Compliance: This report identifies multi-layer root causes, not just the surface symptom.
- [x] Rule: "NEVER assume code that compiles will work in production"
  - Compliance: Traced actual runtime data flow, not just static code analysis.
- [x] Rule: "ALWAYS verify API endpoints work with actual HTTP requests"
  - Compliance: Traced the full POST `/api/projects/[projectId]/orchestration/build` → triggerBuild → dispatch → agent flow.

---

## 2. Expected Behavior

- **Expected**: When a user triggers a build for a finalized card with approved planned files, the coder agent should create concrete code files (components, API routes, lib modules, pages) in the target repository's feature branch, and the repo file tree in the UI should show those files.
- **Source**: `docs/SYSTEM_ARCHITECTURE.md` Build Path: "agents write files, commit to feature branch" and "GET /api/projects/[id]/files?source=repo → repo file tree + diff status".

**Expected behavior established**: YES

---

## 3. Root Cause Investigation

### 3.1 Data Flow

```
User → Build button (implementation-card.tsx onBuildCard)
  → useTriggerBuild hook → POST /api/projects/[projectId]/orchestration/build
  → triggerBuild(db, input) [trigger-build.ts]
    → Validates: single-build lock, project exists, repo connected, cards finalized, approved planned files
    → ensureClone(projectId, repoUrl) → ~/.dossier/repos/<projectId>/ [repo-manager.ts]
    → createRun(db, input) [create-run.ts]
    → For each card:
      → getCardPlannedFiles(db, cardId) → filter status === "approved"
      → allowedPaths = approved files OR DEFAULT_ALLOWED_PATHS
      → createFeatureBranch(clonePath, featureBranch, baseBranch) [repo-manager.ts]
      → createAssignment(db, { allowed_paths, feature_branch, worktree_path }) [create-assignment.ts]
      → dispatchAssignment(db, { assignment_id }) [dispatch.ts]
        → Fetches assignment, card, approved planned files, requirements, context artifacts, memory
        → Builds DispatchPayload with planned_files_detail, allowed_paths, acceptance_criteria
        → createAgenticFlowClient().dispatch(payload) [agentic-flow-client.ts]
          → buildTaskFromPayload(payload) → taskDescription string [build-task.ts]
          → claudeAgent(agentDef, taskDescription) [agentic-flow SDK]
            → Agent runs with Write/Edit/Bash/Read/Glob/Grep tools
            → Agent writes files, commits (hopefully)
          → On completion: processWebhook(db, { event_type: "execution_completed" }) [process-webhook.ts]
            → updateCard(cardId, { build_state: "completed" })
            → executeRequiredChecks(db, runId) [execute-checks.ts]
  → UI: GET /api/projects/[id]/files?source=repo → repo file tree
```

### 3.2 Uncertainty Register

**KNOWN**:
1. Planning LLM creates planned files with status `"proposed"` (apply-action.ts line 318)
2. User must manually approve each planned file via the UI "Approve" button
3. Finalize route does NOT require approved planned files — only requires >= 1 requirement
4. trigger-build.ts now has a validation gate (lines 148-174) requiring approved planned files, but this is in uncommitted changes (`M lib/orchestration/trigger-build.ts` per git status)
5. `claudeAgent()` function accepts (agentDef, input, onStream?, modelOverride?) — NO CWD parameter
6. Agent executes in process.cwd() = Dossier project root, NOT the target repo clone
7. Empty repos are seeded with a README.md by `seedEmptyRepo()` (repo-manager.ts lines 51-62)
8. process-webhook.ts marks build_state "completed" with NO validation of produced code content
9. The coder agent system prompt (from agentic-flow) is generic — no project/Dossier-specific context
10. All 42 orchestration tests pass

**UNKNOWN**:
- Whether agentic-flow's `claudeAgent` internally calls `process.chdir()` or sets CWD via the Claude Agent SDK's `query()` options — type signature suggests NO CWD support

**ASSUMED**: None blocking.

**Status**: CLEAR

### 3.3 Bug Verification

**Bug verified**: YES — multiple code paths and architectural gaps explain the README-only outcome. The symptom is reproducible when: (a) planned files are not approved before build, and/or (b) the agent execution environment CWD is the Dossier project rather than the target repo clone.

### 3.4 Technical Investigation

#### Issue 1: Agent CWD Mismatch (CRITICAL)

**File**: `lib/orchestration/agentic-flow-client.ts` lines 224-236

The `claudeAgent()` function is called without any CWD configuration:

```typescript
const result = await agenticFlow.claudeAgent(
  agent,          // generic coder agent definition
  taskDescription, // includes "Worktree: /path/to/clone" as text
  (chunk: string) => { ... }
);
```

The agentic-flow `claudeAgent` signature has NO CWD parameter:
```typescript
claudeAgent(agent: AgentDefinition, input: string, onStream?, modelOverride?): Promise<{output, agent}>
```

The `AgentDefinition` type also lacks CWD:
```typescript
interface AgentDefinition {
  name: string; description: string; systemPrompt: string;
  color?: string; tools?: string[]; filePath: string;
}
```

**Impact**: The agent's filesystem tools (Write, Read, Bash, etc.) operate in `process.cwd()` — the Dossier project root (`/Users/richardliebrecht/Dossier`), NOT the target repo clone at `~/.dossier/repos/<projectId>/`. The task description mentions the worktree path, but the agent must self-navigate there via Bash `cd` commands. A generic coder agent has no guarantee of doing this.

#### Issue 2: No Auto-Approve for LLM-Generated Planned Files

**File**: `lib/actions/apply-action.ts` lines 309-318

```typescript
const newFile = {
  ...
  status: "proposed" as const,  // Always "proposed", never auto-approved
  ...
};
```

**File**: `app/api/projects/[projectId]/cards/[cardId]/finalize/route.ts` lines 151-155

Finalize requires requirements but NOT approved planned files:
```typescript
const requirements = await getCardRequirements(db, cardId);
if (requirements.length === 0) {
  return validationError("Card must have at least one requirement before finalization");
}
// No planned file check!
```

**Impact**: The user workflow allows: create card → chat to populate planned files (status: "proposed") → finalize → build. If the user doesn't manually approve each planned file, the card has no approved files for the build.

#### Issue 3: Validation Gate Exists but Is Uncommitted

**File**: `lib/orchestration/trigger-build.ts` lines 147-174

The validation gate requiring approved planned files is present in the working tree but per git status (`M lib/orchestration/trigger-build.ts`), this change is uncommitted and likely not deployed. If the production code lacks this gate, builds proceed with zero approved planned files.

#### Issue 4: Task Description Fallback Ambiguity

**File**: `lib/orchestration/build-task.ts` lines 188-193

When `plannedFilesDetail` is empty (no approved files), the task falls back to:
```
Create or edit files under these allowed paths:
- `src`
- `app`
- `lib`
- `components`

You MUST implement the card scope by creating or editing concrete code files...
```

While hardened text was added, directory-level paths with no specific file targets give the agent too much latitude. Combined with the CWD mismatch (Issue 1), the agent may create minimal output (a README) in the wrong directory.

#### Issue 5: No Post-Execution Output Validation

**File**: `lib/orchestration/process-webhook.ts` lines 213-229

When `execution_completed` arrives, the card is marked as "completed" unconditionally:
```typescript
case "execution_completed": {
  // ...
  await db.updateCard(cardId, {
    build_state: "completed",
    last_built_at: new Date().toISOString(),
  });
  // No check for: Were planned files actually created? Is the diff non-trivial?
}
```

**Impact**: Even if the agent produces only a README (or nothing meaningful), the build is marked "completed" and the UI shows success.

#### Issue 6: Empty Repo Seeding Creates Only README

**File**: `lib/orchestration/repo-manager.ts` lines 51-62

```typescript
function seedEmptyRepo(clonePath: string, baseBranch: string): void {
  runGitSync(clonePath, `checkout -b ${baseBranch}`);
  fs.writeFileSync(path.join(clonePath, "README.md"), "# New Project\n\nInitialized by Dossier.\n");
  runGitSync(clonePath, "add README.md");
  runGitSync(clonePath, 'commit -m "chore: initialize repository (Dossier)"...');
}
```

For freshly-created repos, the only file is README.md. The agent sees a nearly-empty repo and, without strong file-level instructions, may produce minimal changes.

#### Issue 7: Generic Agent System Prompt

**File**: `node_modules/agentic-flow/.claude/agents/core/coder.md`

The coder agent system prompt is a generic "senior software engineer" prompt with no knowledge of:
- The Dossier card/planned-file paradigm
- That it needs to `cd` to the worktree path before writing files
- That it must `git add` and `git commit` on the feature branch
- The target project's tech stack (this is only in the task description, not the system prompt)

### 3.5 Root Cause Analysis (5-Whys)

#### Why #1: Why does the repo file tree show only a README?
Because the coder agent wrote only a README (or nothing) and committed no real code files to the feature branch.

#### Why #2: Why did the agent not write real code files?
Two paths:
- (a) The agent received only directory-level allowed paths (src, app, lib, components) with no specific file targets because no planned files were approved.
- (b) Even with planned files, the agent's CWD was the Dossier project root, not the target repo clone, so file operations went to the wrong directory.

#### Why #3: Why were no planned files approved?
Because (a) the Planning LLM always creates planned files as "proposed", (b) finalize does not require approved planned files, and (c) the user may not realize they need to manually click "Approve" on each file before building.

#### Why #4: Why does the agent execute in the wrong CWD?
Because `claudeAgent()` from agentic-flow accepts no CWD parameter, and `createRealAgenticFlowClient()` does not call `process.chdir()` or otherwise configure the execution environment's working directory before calling the agent.

#### Why #5: Why does the system accept a README-only build as "completed"?
Because `processWebhook` (execution_completed handler) unconditionally marks `build_state: "completed"` with no validation of the produced git diff — no check that planned files were fulfilled, no minimum file count, no content heuristic.

---

## 4. Test Coverage

### 4.1 Existing Tests

| Test file | Tests | Status |
|-----------|-------|--------|
| `__tests__/orchestration/build-task.test.ts` | 2 tests | All pass |
| `__tests__/orchestration/trigger-build.test.ts` | 5 tests | All pass |
| `__tests__/orchestration/execution-integration.test.ts` | 11 tests | All pass |
| Total orchestration | 42 tests (9 files) | All pass |

### 4.2 Test Gaps Identified

**Test Applicable**: YES — but critical scenarios are missing.

| Gap | Description | Priority |
|-----|-------------|----------|
| **Missing: CWD propagation** | No test verifies the agent receives correct CWD for the target repo | CRITICAL |
| **Missing: Planned file fulfillment** | No test verifies that execution_completed validates planned files were created | HIGH |
| **Missing: Task text with planned files** | build-task.test.ts only tests directory-level fallback, not the case with real planned_files_detail | HIGH |
| **Missing: Finalize + approve gate** | No test verifies finalize requires approved planned files | MEDIUM |
| **Missing: Empty repo seeding** | No test verifies agent behavior when repo has only seeded README | MEDIUM |

### 4.3 Tests That Should Be Written

1. **build-task.test.ts** — Add test: `buildTaskFromPayload` with `planned_files_detail` present → task includes specific file instructions (not directory fallback)
2. **trigger-build.test.ts** — The "rejects when card(s) have no approved planned files" test exists (line 167) but only for zero files. Add: proposed-only files also trigger rejection.
3. **dispatch.test.ts** — New: Verify `DispatchPayload.worktree_path` is correctly set and non-null for single-card builds
4. **agentic-flow-client.test.ts** — New: Verify agent execution environment sets CWD to `worktree_path` (currently no such test)
5. **process-webhook.test.ts** — New: execution_completed with empty commit diff should NOT mark build_state as "completed"

---

## 5. All Contributing Factors (Ranked by Impact)

| # | Factor | Severity | Location | Lines |
|---|--------|----------|----------|-------|
| 1 | **Agent CWD mismatch**: Agent runs in Dossier root, not target repo clone | CRITICAL | `lib/orchestration/agentic-flow-client.ts` | 224-236 |
| 2 | **No post-execution content validation**: build marked "completed" regardless of output | HIGH | `lib/orchestration/process-webhook.ts` | 213-229 |
| 3 | **No auto-approve for planned files**: LLM-created files always "proposed" | HIGH | `lib/actions/apply-action.ts` | 318 |
| 4 | **Finalize skips planned file check**: cards finalized without approved files | HIGH | `app/api/projects/.../finalize/route.ts` | 151-155 |
| 5 | **Validation gate uncommitted**: approved-file gate in trigger-build is not deployed | HIGH | `lib/orchestration/trigger-build.ts` | 147-174 |
| 6 | **Task fallback ambiguity**: directory-level paths give agent too much latitude | MEDIUM | `lib/orchestration/build-task.ts` | 188-193 |
| 7 | **Empty repo seeding**: fresh repos have only README.md as context | MEDIUM | `lib/orchestration/repo-manager.ts` | 51-62 |
| 8 | **Generic agent system prompt**: no project-specific or Dossier paradigm context | MEDIUM | agentic-flow `coder.md` (external dep) | entire file |

---

## 6. Recommendations

### R1: Fix Agent CWD (CRITICAL — root cause)

**Option A (Preferred)**: Before calling `claudeAgent()`, call `process.chdir(worktreePath)` in `agentic-flow-client.ts`, and restore CWD after execution completes.

```typescript
// In createRealAgenticFlowClient().dispatch():
const originalCwd = process.cwd();
if (payload.worktree_path) {
  process.chdir(payload.worktree_path);
}
try {
  const result = await agenticFlow.claudeAgent(agent, taskDescription, ...);
  // ...
} finally {
  process.chdir(originalCwd);
}
```

**Option B**: Prepend an explicit `cd` instruction to the task description:
```
IMPORTANT: Before any file operations, run: cd /path/to/worktree
All file operations must happen in this directory.
```

**Option C**: Fork or extend agentic-flow to accept a `cwd` option in `claudeAgent()`.

### R2: Add Post-Execution Output Validation (HIGH)

In `processWebhook`, when handling `execution_completed`:
1. Check git diff on the feature branch vs base branch
2. Verify at least one non-README code file was created/modified
3. If the commit only contains README changes, mark build_state as "needs_review" or "failed" instead of "completed"
4. Optionally: verify each approved planned file path appears in the diff

### R3: Commit and Deploy the Validation Gate (HIGH)

The approved-planned-file validation gate in `trigger-build.ts` (lines 147-174) is in uncommitted changes. Commit and deploy this gate to prevent builds with no approved planned files.

### R4: Add Planned File Approval to Finalize Flow (HIGH)

In the finalize POST route, add a check after requirements validation:
```typescript
const plannedFiles = await getCardPlannedFiles(db, cardId);
const approved = plannedFiles.filter(pf => pf.status === "approved");
if (approved.length === 0) {
  return validationError("Card must have at least one approved code file before finalization");
}
```

### R5: Consider Auto-Approve for LLM-Generated Planned Files (MEDIUM)

Change `applyUpsertCardPlannedFile` to set status as `"approved"` instead of `"proposed"` when created by the planning LLM, or provide a "Approve All" bulk action in the UI. This reduces friction in the user workflow.

### R6: Enhance Task Description with Explicit CWD + Git Instructions (MEDIUM)

In `buildTaskFromPayload`, add explicit instructions at the top of the task:
```
CRITICAL SETUP:
1. cd to worktree: cd /path/to/clone
2. Verify branch: git checkout feat/run-xxx-yyy (create if needed)
3. All file operations must happen in this worktree directory
4. After implementation: git add -A && git commit -m "feat: [card title]"
```

### R7: Enhance Agent System Prompt for Dossier Context (MEDIUM)

Either:
- Create a custom Dossier-specific agent definition (`.claude/agents/dossier-coder.md`) and load it instead of the generic coder
- Or inject Dossier-specific context into the system prompt when constructing the agent definition in `agentic-flow-client.ts`

---

## 7. Implementation Priority

| Order | Fix | Estimated effort | Risk if skipped |
|-------|-----|-----------------|-----------------|
| 1 | R1: Fix Agent CWD | 30 min | Builds never produce code in correct repo |
| 2 | R3: Commit validation gate | 5 min | Builds with no planned files continue |
| 3 | R6: Explicit CWD + git instructions in task | 30 min | Agent may still ignore worktree path |
| 4 | R2: Post-execution output validation | 1 hr | README-only builds marked as "completed" |
| 5 | R4: Finalize requires approved files | 15 min | Users can finalize without approving files |
| 6 | R5: Auto-approve or bulk approve | 30 min | User friction leads to forgotten approvals |
| 7 | R7: Custom agent system prompt | 1 hr | Generic prompt lacks project context |

---

*Investigation completed per .cursor/agents/investigator.md methodology.*
