---
document_id: doc.user-stories
last_verified: 2026-02-18
tokens_estimate: 300
tags:
  - product
  - stories
  - acceptance
anchors:
  - id: stories
    summary: "Feature scope and acceptance criteria per workflow"
ttl_expires_on: null
---
# User Stories

## Idea to Map
- **As a** developer **I want** to describe my product idea in chat **so that** I get a structured story map (workflows, activities, cards)
- **Acceptance**: Map persists; all mutations via PlanningAction; refresh retains state

## Card Context
- **As a** developer **I want** to attach context and approve planned files per card **so that** builds have precise boundaries
- **Acceptance**: Build cannot trigger without approved planned files and finalized_at; artifact_kind excludes test artifacts

## Finalize for Build
- **As a** developer **I want** the system to generate context documents and e2e tests from my plan **so that** build agents have the right context and tests validate my requirements
- **Acceptance**: 5 project-wide docs generated; each card with requirements gets an e2e test; user clicks "Finalize Project" then "Finalize" per card; build requires finalized card; build rejects with toast if card not finalized

## Build to PR
- **As a** developer **I want** to trigger a build and receive a draft PR **so that** I can review before merge
- **Acceptance**: Build button shows Queued/Building/Blocked states; approval only after checks pass; PR creation and merge user-gated; build rejects non-finalized cards with clear message

## Related
- [user-workflows-reference.md](user-workflows-reference.md)
- [user-personas.md](user-personas.md)
