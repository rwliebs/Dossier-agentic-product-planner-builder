---
document_id: plan.future-enhancements
last_verified: 2026-03-06
tokens_estimate: 300
ttl_expires_on: 2026-04-06
tags:
  - feature-plan
  - enhancements
---
# Feature: Deferred Enhancements

**Status**: Proposed
**Target**: TBD

## Problem
Several capabilities described in early strategy documents remain unbuilt. This document tracks them as a single backlog entry.

## Items

### Provider Adapter Abstraction
- Current: Direct Anthropic SDK integration for planning and build
- Future: Provider-agnostic adapter supporting OpenAI, Vertex, custom providers
- Deferred until after MVP stability; internal boundary already clean enough for later extraction

### Architecture View Entities
- `CodeFile` and `CardCodeFile` tables (many-to-many card ↔ file links with `implementation | test` type)
- `DataFlow` entity for inter-component data relationship visualization
- Currently: architecture view is UI-only with no persistent entities

### Taxonomy Objects
- `WorkflowLabel` and `VersionLabel` lightweight taxonomy tables
- `workflow_label_key` and `version_label_key` FK columns on WorkflowActivity and Card
- Currently: not implemented; workflows and cards use freeform titles

### Reliability SLOs and Monitoring
- Action schema validity >= 99%
- Deterministic apply success on accepted actions >= 99.5%
- Preview/apply mismatch rate <= 0.5%
- Operational dashboards for rejection rates, rollback frequency, sync lag
- Currently: no SLO enforcement or dashboards

### Integration Check Agent
- Dedicated agent pass that validates cross-card compatibility before PR approval
- Mandatory for `workflow` scope builds
- Currently: not implemented; single-card builds only
