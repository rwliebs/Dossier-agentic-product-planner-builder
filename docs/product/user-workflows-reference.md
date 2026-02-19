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
ttl_expires_on: null
---
# User Workflows Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md#overview](../SYSTEM_ARCHITECTURE.md#overview)

## Contract

### Invariants
- INVARIANT: Map structure is Workflow → Activity → Step → Card; all mutations via PlanningAction
- INVARIANT: Build cannot trigger without at least one approved CardPlannedFile per targeted card
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
| 4 | System | Card build-ready when ≥1 CardPlannedFile status = approved |

**Success outcomes**:
- Context linked via CardContextArtifact
- Planned files follow schema; artifact_kind excludes test artifacts
- Build cannot trigger without approved planned files for targeted cards

**Data flow**: `linkContextArtifact`, `upsertCardPlannedFile`, `approveCardPlannedFile` actions

---

## Workflow C: Build Trigger to Draft PR

**User intent**: Run a card or workflow build and receive a draft PR for review.

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Triggers build (card or workflow scope) |
| 2 | System | Resolves system-wide and per-build input contracts |
| 3 | System | Memory retrieval (card-scoped first) |
| 4 | Agents | Execute within assignment boundaries |
| 5 | System | Required checks run (dependency, security, policy, lint, unit, integration, e2e) |
| 6 | System | Approval requested only after checks pass |
| 7 | User | Reviews draft PR; approves merge |

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
