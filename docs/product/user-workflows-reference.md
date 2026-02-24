---
document_id: doc.user-workflows
last_verified: 2026-02-23
tokens_estimate: 1200
tags:
  - ux
  - workflows
  - user-journey
anchors:
  - id: new-software
    summary: "New software: idea → workflows → build → review → push → iterate"
  - id: existing-software
    summary: "Existing software: add repo → map → change → review → merge"
ttl_expires_on: null
---
# User Workflows Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md#overview](../SYSTEM_ARCHITECTURE.md#overview)

## Contract

### Invariants
- INVARIANT: Map structure is Workflow → Activity → Step → Card; all mutations via PlanningAction
- INVARIANT: Build cannot trigger without finalized cards (planned files or folders are required; user must approve at least one per card before finalization. For new builds, the agent may propose folder paths (e.g. components/auth/) where files should go.)
- INVARIANT: Project must be finalized before cards can be finalized
- INVARIANT: Build cannot trigger without card.finalized_at set (card finalization confirmed)
- INVARIANT: Knowledge items (requirements, facts, assumptions, questions) are used when they exist; no approval step

### Boundaries
- ALLOWED: User edits map, approves planned files, triggers builds, approves PRs
- FORBIDDEN: Auto-merge to main; approval request before required checks pass

---

## New Software

Workflows for building software from scratch in Dossier.

### 1. Turning a Brand New Idea into Workflows and Finalizing Project-Level Details

**User intent**: Turn a product idea into a visual, editable story map and lock in project-level context.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Submits idea via chat |
| 2 | Planning LLM | May ask follow-up questions in chat (target users, core problem, key goals) before generating the map |
| 3 | User | Responds to questions; provides additional context as needed |
| 4 | Planning LLM | Produces workflows (backbone structure) via scaffold |
| 5 | User | Sees map on canvas; edits, reorders, refines |
| 6 | User | Clicks **Finalize Project** when ready |
| 7 | System | Creates and links remote repo (user creates via Connect Repository or links existing) |
| 8 | Planning LLM (finalize mode) | Produces project-wide context docs (architectural summary, data contracts, domain summaries, workflow summaries, design system) + per-card e2e tests |
| 9 | System | Persists via PlanningAction; refresh retains state |

**Success outcomes**:
- Workflows created (backbone); activities and cards added in Workflow 2
- Remote repo created and linked at finalization
- Project-level context documents and per-card e2e tests created
- User can refresh and see persisted state

**Data flow**: `User chat → POST /chat/stream → stream-action-parser → POST /actions → apply-action → DbAdapter`; repo creation via Connect Repository at finalization

---

### 2. Adding User Actions and Functionality Ideas to Workflows

**User intent**: Define what users can do per workflow and per card; add functionality ideas.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent | Defines a first pass of user actions per workflow and per card (e.g. View Details & Edit, Monitor, Reply, Test, Build) |
| 2 | User | Reviews and edits the proposed actions via chat or map — before functionality cards are planned |
| 3 | Planning LLM | Plans functionality cards from the finalized actions; links context artifacts |
| 4 | User | Links context artifacts as needed; refines further |

**Success outcomes**:
- User actions and functionality ideas captured in workflows and cards
- Context linked via CardContextArtifact where relevant

**Data flow**: `linkContextArtifact`, `createCard`, `updateCard` actions

---

### 3. Adding/Editing Functionality Details and Triggering a Build

**User intent**: Specify requirements, planned files, and other details per card; finalize and build.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent | Proposes requirements, planned files, knowledge items; user can add or edit any directly |
| 2 | User | Reviews and approves agent-proposed planned files or folders per card (required; agent may propose folder paths for new builds) |
| 3 | User | Clicks **Finalize** on each card (validates requirements and approved planned files/folders; sets finalized_at) |
| 4 | User | Clicks **Build** on a card (or Build All for workflow) |
| 5 | System | Validates: card has finalized_at; rejects with toast if not |
| 6 | System | Clones repo, creates feature branch per card build, runs agents, executes checks |
| 7 | System | Auto-commits agent-produced files; Files tab shows produced code |

**Build button states** (per card):
- **Build** — Ready; click to trigger
- **Queued...** — Build submitted, waiting to start
- **Building...** — Agent actively executing
- **Blocked — answer questions** — Agent paused; answer card questions to unblock

**Success outcomes**:
- Card finalized; build triggered
- Feature branch created per card build
- Agent writes files to worktree; auto-commit makes them visible in Files tab
- Required checks run before approval requested

**Data flow**: `ensureClone → OrchestrationRun → CardAssignment[] → agentic-flow (cwd=clone) → auto-commit → GET /files?source=repo`

---

### 4. Reviewing the Product, Asking for Changes, and Accepting Results

**User intent**: Review produced code, test on local server, request changes via agent, trigger a new build cycle.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Reviews code in **Files** tab (Repository mode) with diff indicators (added/modified/deleted) |
| 2 | User | Clicks a frontend file; system shows HTML preview on local server — or clicks a non-UI file; system shows terminal view |
| 3 | User | Optionally runs full app locally (clone path in ~/.dossier/repos/&lt;projectId&gt;/) to verify behavior |
| 4 | User | Prompts agent via chat with change requests (e.g. "make the button blue", "add validation") |
| 5 | Planning LLM | Updates requirements, knowledge items, or planned files; may create new cards |
| 6 | User | Re-finalizes affected cards if needed; triggers new build |
| 7 | User | Accepts the result when satisfied |

**Success outcomes**:
- User can inspect produced files and diffs
- Clicking a frontend file shows HTML preview on local server; clicking a non-UI file shows terminal view
- User can iterate via chat and trigger rebuilds
- User accepts result in-app; push and merge happen in Workflow 5

**Data flow**: `GET /files?source=repo` (tree, content, diff) → chat → PlanningAction[] → trigger build

---

### 5. Pushing the Software Live

**User intent**: Push built software to the remote repo (created at project finalization) and publish.

| Step | Actor | Action |
|------|-------|--------|
| 1 | System | Repo already exists from project finalization (user created or linked at that step) |
| 2 | Agent or user | Agent pushes feature branch and creates PR when build completes; user can manually trigger push to remote (e.g. via Push button) |
| 3 | User | Merges PR on GitHub; software is live |

**Success outcomes**:
- Repo created at finalization; builds clone and work in that repo
- User can push and create PRs via agent or manually (Push button)

**Data flow**: `ensureClone` → agent push → GitHub PR

---

### 6. Adding User Feedback and Iterating

**User intent**: Incorporate new feedback as context and trigger a rebuild.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Adds feedback via chat (e.g. "users want a dark mode toggle", "the form should validate email"); can target a specific card |
| 2 | System | Adds user feedback to the specified card as context; Planning LLM creates/updates requirements, knowledge items, or cards |
| 3 | User | Reviews changes; re-finalizes cards if needed |
| 4 | User | Triggers rebuild |
| 5 | Agent | Executes with updated context; produces new code |
| 6 | User | Reviews, accepts, or iterates again |

**Success outcomes**:
- System can add user feedback to a specific card as context
- Feedback captured as card requirements, knowledge items, or linked artifacts
- Rebuild uses updated context; iteration loop continues

**Data flow**: `chat → upsertCardRequirement` / `upsertCardKnowledgeItem` / `linkContextArtifact` → trigger build

---

## Existing Software

Workflows for evolving software that already exists (codebase in a repo).

### 1. Adding an Existing Repo and Mapping the Product

**User intent**: Connect an existing codebase and have the agent map it to a story map.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Creates project; clicks **Connect Repository**; links existing GitHub repo (Link existing → select from list) |
| 2 | System | Dossier pulls down a copy from remote to create the local directory (~/.dossier/repos/&lt;projectId&gt;/) |
| 3 | User | Optionally selects files for context (e.g. key modules, README); describes the product or asks agent to map from the repo |
| 4 | Agent | Examines the repo; produces workflows, activities, cards that reflect existing functionality |
| 5 | System | Persists map; repo files available as context for future changes |

**Success outcomes**:
- Repo linked; local copy pulled from remote
- Map reflects existing product structure (agent examines repo to create map)

**Data flow**: `linkRepo` → `ensureClone` (pull from remote) → chat (agent examines repo) → PlanningAction[]

---

### 2. Making Changes to Existing Functionality

**User intent**: Represent desired changes through a card that describes the new state.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Describes the change via chat (e.g. "refactor the login to use OAuth", "add pagination to the list") |
| 2 | Planning LLM | Creates or updates a card with requirements and planned files that represent the new state |
| 3 | User | Reviews card; adds/edits requirements, links relevant existing files as context |
| 4 | User | Finalizes card; triggers build |
| 5 | Agent | Edits existing files per card scope; produces changes |

**Success outcomes**:
- Card captures "before → after" intent
- Build modifies existing files in place

**Data flow**: `chat → createCard` / `updateCard` → `linkContextArtifact` (existing files) → finalize → trigger build

---

### 3. Adding Functionality to an Existing Workflow

**User intent**: Add new workflows, activities, or cards amidst the existing map.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Describes new functionality via chat (e.g. "add a workflow for exporting data", "add a card for bulk delete under Manage Items") |
| 2 | Planning LLM | Creates workflows, activities, steps, or cards in the appropriate place |
| 3 | User | Edits map (reorder, refine); links context artifacts |
| 4 | User | Finalizes new cards; triggers build |
| 5 | Agent | Implements new functionality; may create new files or extend existing ones |

**Success outcomes**:
- New structure integrated into existing map
- Build adds or extends code without breaking existing flows

**Data flow**: `chat → createWorkflow` / `createActivity` / `createCard` → PlanningAction[] → finalize → trigger build

---

### 4. Reviewing Changes and Iterating

**User intent**: Review agent-produced changes, request edits via chat, accept the result — same flow as New Software Workflow 4.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Reviews code in **Files** tab (Repository mode) with diff indicators (added/modified/deleted) |
| 2 | User | Clicks a frontend file; system shows HTML preview on local server — or clicks a non-UI file; system shows terminal view |
| 3 | User | Optionally runs full app locally to verify behavior |
| 4 | User | Prompts agent via chat with change requests |
| 5 | Planning LLM | Updates requirements, knowledge items, or planned files; may create new cards |
| 6 | User | Re-finalizes affected cards if needed; triggers new build |
| 7 | User | Accepts the result when satisfied |

**Success outcomes**:
- Same review/iterate flow as New Software Workflow 4
- User accepts result in-app; push and merge happen in Workflow 5

**Data flow**: `GET /files?source=repo` (tree, content, diff) → chat → PlanningAction[] → trigger build

---

### 5. Pushing and Merging into the Existing Repo

**User intent**: Push accepted changes to remote and merge into main — same flow as New Software Workflow 5.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent or user | Agent pushes feature branch and creates PR when build completes; user can manually trigger push to remote (e.g. via Push button) |
| 2 | User | Merges PR on GitHub; changes are live |
| 3 | System | Main branch updated; next build fetches latest |

**Success outcomes**:
- Same push/merge flow as New Software Workflow 5
- Changes merged into main; repo state reflects accepted work

**Data flow**: agent push / user push → GitHub PR → user merge → `ensureClone` (fetch) on next build

---

## Knowledge Items (Cross-Cutting)

**What they are**: Card-level requirements, facts, assumptions, and questions — used as build context when they exist.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent or user | Creates knowledge items via chat or card UI |
| 2 | User | Edits requirements directly in card |
| 3 | System | Orchestration uses all existing items for build context; no approval step |

**Data flow**: `upsertCardKnowledgeItem` (create/edit)

---

## Verification
- [ ] Each workflow traceable through API routes and services
- [ ] Success outcomes achievable end-to-end
- [ ] Error states handled (validation, policy violations)

## Related
- [.cursor/agents/strategy-fidelity-voc.md](../../.cursor/agents/strategy-fidelity-voc.md)
- [strategy/dual-llm-integration-strategy.md](../strategy/dual-llm-integration-strategy.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
