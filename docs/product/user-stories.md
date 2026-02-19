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
- **Acceptance**: Build cannot trigger without approved planned files; artifact_kind excludes test artifacts

## Build to PR
- **As a** developer **I want** to trigger a build and receive a draft PR **so that** I can review before merge
- **Acceptance**: Approval only after checks pass; PR creation and merge user-gated

## Related
- [user-workflows-reference.md](user-workflows-reference.md)
- [user-personas.md](user-personas.md)
