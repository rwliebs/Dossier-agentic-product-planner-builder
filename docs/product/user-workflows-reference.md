---
document_id: doc.user-workflows
last_verified: 2026-02-18
tokens_estimate: 900
tags:
  - ux
  - workflows
  - user-journey
anchors:
  - id: workflow-a
    summary: "Idea to structured map: chat → LLM → map canvas"
  - id: workflow-b
    summary: "Card context: artifacts, planned files, approval"
  - id: workflow-c
    summary: "Build trigger to draft PR: agents, checks, approval"
  - id: workflow-d
    summary: "Knowledge lifecycle: draft → approved/rejected"
  - id: workflow-e
    summary: "Finalization: project docs, e2e tests, per-card finalize gate"
ttl_expires_on: null
---
# User Workflows Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md#overview](../SYSTEM_ARCHITECTURE.md#overview)

## Contract

### Invariants
- INVARIANT: Map structure is Workflow → Activity → Step → Card; all mutations via PlanningAction
- INVARIANT: Build cannot trigger without at least one approved CardPlannedFile per targeted card
- INVARIANT: Build cannot trigger without card.finalized_at set (card finalization confirmed)
- INVARIANT: Orchestration retrieval excludes rejected knowledge items; approved items are authoritative

### Boundaries
- ALLOWED: User edits map, approves planned files, triggers builds, approves PRs
- FORBIDDEN: Auto-merge to main; approval request before required checks pass

---

## Workflow A: Idea to Structured Map

**User intent**: Turn a product idea into a visual, editable story map.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Submits idea via chat or input |
| 2 | Planning LLM | Produces structured map (workflows, activities, steps, cards) |
| 3 | User | Sees map on canvas; edits, reorders, refines |
| 4 | System | Persists via PlanningAction; refresh retains state |

**Success outcomes**:
- Map structure: Workflow → Activity → Step → Card
- All mutations through PlanningAction; no direct state edits
- User can refresh and see persisted state

**Data flow**: `User chat → POST /chat/stream → stream-action-parser → POST /actions → apply-action → DbAdapter`

---

## Workflow B: Card Context and Planned Files

**User intent**: Attach context to a card and define planned files before build.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User or agent | Links context artifacts to card |
| 2 | Planning LLM | Proposes planned files (logical_file_name, artifact_kind, action, intent_summary) |
| 3 | User | Reviews and approves planned files per card |
| 4 | System | Card has approved planned files; still requires finalization (Workflow E) before build |

**Success outcomes**:
- Context linked via CardContextArtifact
- Planned files follow schema; artifact_kind excludes test artifacts
- Build cannot trigger without approved planned files **and** finalized_at for targeted cards

**Data flow**: `linkContextArtifact`, `upsertCardPlannedFile`, `approveCardPlannedFile` actions

---

## Workflow C: Build Trigger to Draft PR

**User intent**: Run a card or workflow build and receive a draft PR for review.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks **Build** on a card (or Build All for workflow) |
| 2 | System | Validates: card has finalized_at and ≥1 approved planned file; rejects with toast if not |
| 3 | System | Resolves system-wide and per-build input contracts |
| 4 | System | Memory retrieval (card-scoped first) |
| 5 | Agents | Execute within assignment boundaries |
| 6 | System | Required checks run (dependency, security, policy, lint, unit, integration, e2e) |
| 7 | System | Approval requested only after checks pass |
| 8 | User | Reviews draft PR; approves merge |

**Build button states** (per card):
- **Build** — Ready; click to trigger
- **Queued...** — Build submitted, waiting to start
- **Building...** — Agent actively executing
- **Blocked — answer questions** — Agent paused; answer card questions to unblock

**Rejection behavior**: If user triggers build on a non-finalized card, the system returns a validation error (e.g. "Build requires finalized cards. Finalize each card (review context and confirm) before triggering build.") and shows a toast. No run is created.

**Success outcomes**:
- No run requests approval without required checks completed
- PR creation and merge remain user-gated
- Assignment snapshots immutable; card boundaries enforced

**Data flow**: `OrchestrationRun → CardAssignment[] → claude-flow → RunCheck[] → ApprovalRequest → PullRequestCandidate`

---

## Workflow D: Knowledge Lifecycle

**User intent**: Manage card knowledge (requirements, facts, assumptions, questions) with clear status.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent or user | Creates knowledge items (draft) |
| 2 | User | Approves or rejects items |
| 3 | System | Orchestration includes only approved items; never rejected |

**Success outcomes**:
- Knowledge items have explicit status: draft | approved | rejected
- Orchestration retrieval excludes rejected items
- Approved items authoritative over draft

**Data flow**: `upsertCardKnowledgeItem`, `setCardKnowledgeStatus` actions

---

## Workflow E: Finalization (Build Readiness)

**User intent**: Generate context documents and e2e tests, then finalize each card before build.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Clicks **Finalize Project** (Implementation Map header) after planning phases 1-3 |
| 2 | Planning LLM (finalize mode) | Produces project-wide context docs (architectural summary, data contracts, domain summaries, workflow summaries, design system) + per-card e2e tests |
| 3 | System | Saves as ContextArtifact records; tests linked to cards; toast shows count created |
| 4 | User | Clicks **Finalize** on individual card (shown when card has requirements + planned files, not yet finalized) |
| 5 | System | Validates requirements + planned files; sets card.finalized_at; card is build-ready |
| 6 | UI | Shows "Finalized" badge on card; Build button becomes available |

**UI elements**:
- **Finalize Project** — Button in Implementation Map header (next to status counts). Triggers streaming LLM call; shows "Finalizing Project" while running.
- **Finalize** — Per-card button (indigo). Visible when card has ≥1 requirement, ≥1 planned file, and no finalized_at. Hidden after finalization.
- **Finalized** — Badge on card after confirmation (indigo background, check icon).

**Success outcomes**:
- 5 project-wide context documents exist after project finalization
- Each card with requirements gets a linked e2e test artifact (type: test)
- Build trigger requires finalized_at in addition to approved planned files
- Build rejects with clear message if user tries to build non-finalized card

**Data flow**: `POST /chat/stream (mode: finalize) → createContextArtifact actions → POST /cards/[id]/finalize` (confirms per-card finalization)

---

## User Actions per Workflow and Card

After map population, the agent prompts users to define user actions per workflow and per card:
- View Details & Edit
- Monitor
- Reply
- Test
- Build
- Custom actions

Persistence of user-defined actions (e.g. `card_user_actions` table) is a V2 extension.

---

## Verification
- [ ] Each workflow traceable through API routes and services
- [ ] Success outcomes achievable end-to-end
- [ ] Error states handled (validation, policy violations)

## Related
- [.cursor/agents/strategy-fidelity-voc.md](../../.cursor/agents/strategy-fidelity-voc.md)
- [strategy/dual-llm-integration-strategy.md](../strategy/dual-llm-integration-strategy.md)
- [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
