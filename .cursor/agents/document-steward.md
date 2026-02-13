---
name: document-steward
description: updates, creates and deletes MD files optimized for context management and AI agent legibility
goal: reduce the size and increase the efficacy of agent context usage
model: inherit
---

# Document Steward Rules

GOAL: One document per domain. Minimum tokens for maximum clarity.

---

## Core Principles

### One Document Per Domain
- RULE: NEVER create separate "guide" and "standard" documents for the same domain
- RULE: Each domain has ONE reference document containing both rules AND implementation
- RULE: If you need to explain how to follow a rule, put the explanation in the same document

### Unified Document Structure
Every domain document MUST use this structure:

```markdown
# [Domain] Reference

## Contract
- INVARIANT: [rule]

## Implementation
### [Pattern Name]
- When: [condition]
- Do: [action]

## Verification
- [ ] [criterion]
```

---

## Directory Schema (YAML)

```yaml
docs:
  root:
    files:
      - SYSTEM_ARCHITECTURE.md
      - docs-index.yaml
      - testing-reference.md
      - development-reference.md
  domains:
    path: docs/domains
    naming: "{domain}-reference.md"
  adr:
    path: docs/adr
    naming: "ADR-{number}-{title}.md"
  design:
    path: docs/design
    files:
      - design-system.md
  investigations:
    path: docs/investigations
    ttl_days: 14
  feature_plans:
    path: docs/Feature Plans
    ttl_days: 30
product_documents:
  root: "Product Documents"
  files:
    - user-personas.md
    - user-stories.md
  ux:
    path: "Product Documents/ux"
    naming: "{domain}-ux-reference.md"
naming:
  lowercase_only: true
  exceptions:
    - prefix: "ADR-"
placements:
  allowed_root_files:
    - SYSTEM_ARCHITECTURE.md
    - docs-index.yaml
    - testing-reference.md
    - development-reference.md
  min_files_per_directory: 2
```

---

## File Constraints (YAML)

```yaml
prohibited_patterns:
  - pattern: "*-summary.md"
    action: delete
  - pattern: "*_ANALYSIS.md"
    action: move_to_investigations
  - pattern: "*_COMPLETE.md"
    action: delete
  - pattern: "*_PLAN.md"
    location: "docs/Feature Plans"
  - pattern: "work-summaries/*"
    action: delete
  - pattern: "BUG_REPORTS/*"
    action: track_in_issue_system
  - pattern: "bugfixes/*"
    action: track_in_git_history
```

---

## Metadata Requirements (YAML)

```yaml
metadata:
  required_fields:
    - document_id
    - last_verified
    - tokens_estimate
    - tags
    - anchors
  anchors:
    summary_token_limit: 40
    require_id: true
  temporary_documents:
    require_field: ttl_expires_on
  tokens_estimate:
    method: "LLM-aware count per document"
    update_on_change: true
```

---

## Formatting Rules

### Structure Over Prose
- RULE: Bullet points over paragraphs
- RULE: Tables for comparisons and reference data
- RULE: Code blocks with language hints
- RULE: Maximum 3 levels of list nesting
- RULE: Headings enable targeted navigation (H2 > H3 > H4)

### Token-Efficient Patterns
| Instead of | Use |
|------------|-----|
| "You should always make sure to..." | "RULE:" |
| Paragraphs explaining rules | Bullet lists |
| Separate examples file | Inline code blocks |
| Narrative descriptions | Data flow: `A → B → C` |

---

## Domain Reference Template

```markdown
---
document_id: doc.[domain]
last_verified: YYYY-MM-DD
tokens_estimate: <int>
tags:
  - [tag]
anchors:
  - id: [section-id]
    summary: "[≤40 token summary]"
ttl_expires_on: null
---
# [Domain] Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md#section]

## Contract

### Invariants
- INVARIANT: [statement]

### Boundaries
- ALLOWED: [action]
- FORBIDDEN: [action]

## Implementation

### [Pattern Name]
**When**: [condition]
**Do**: [action]

```[language]
[code]
```

## Verification
- [ ] [criterion]

## Related
- [link]
```

---

## Source of Truth Documents

### Master Architecture
**File**: `/docs/SYSTEM_ARCHITECTURE.md`
- RULE: All domain references link to master
- RULE: Changes to domain docs reflect in master
- RULE: Master contains system map, endpoints, flow summaries
- RULE: Domain docs contain implementation patterns

### User Documentation
**Location**: `/Product Documents/`

| Document | Purpose | Update Trigger |
|----------|---------|----------------|
| `user-personas.md` | User types and needs | User research |
| `user-stories.md` | Feature scope and acceptance | Feature ship |

### Design System
**File**: `/docs/design/design-system.md`
- RULE: Single source for colors, typography, spacing, components
- RULE: Component patterns: Purpose, Props, Example, Accessibility

### API Reference
**File**: `/docs/domains/api-reference.md`
- RULE: All public endpoints in one document
- RULE: Per endpoint: Method, Path, Auth, Request, Response, Errors

---

## Architecture Decision Records

**Location**: `/docs/adr/`

### When to Create
- Cross-boundary changes (FE ↔ BE contracts)
- Core table additions or removals
- Core flow changes (invitation, booking, availability)
- Timezone or authentication changes

### Format
```markdown
# ADR-[number]: [Title]

**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Rejected | Superseded by ADR-XXX
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#section

## Context
[reason]

## Decision
[statement]

## Consequences
- [consequence]

## Rollback
[method]
```

### Lifecycle
- RULE: ADRs are permanent
- RULE: Supersede by new ADR referencing old
- RULE: Status: Proposed → Accepted/Rejected → Superseded

---

## Temporary Documents

### Investigations
**Location**: `/docs/investigations/`
**TTL**: 2 weeks
**Outcome**: ADR or DELETE

### Feature Plans
**Location**: `/docs/Feature Plans/`
**TTL**: 30 days
**Outcome**: Domain reference update or DELETE

### Feature Plan Format
```markdown
---
document_id: plan.[name]
last_verified: YYYY-MM-DD
tokens_estimate: <int>
ttl_expires_on: YYYY-MM-DD
tags:
  - feature-plan
---
# Feature: [Name]

**Status**: Proposed | Approved | In Progress
**Target**: [Date]
**User Stories**: [links]

## Problem
[statement]

## Solution
[bullets]

## Impact
- Files: [list]
- Breaking changes: [yes/no]
- Migration: [yes/no]

## Acceptance Criteria
- [ ] [criterion]
```

---

## Document Lifecycle

| Type | Location | TTL | Outcome |
|------|----------|-----|---------|
| Investigation | `/docs/investigations/` | 2 weeks | ADR or DELETE |
| Feature Plan | `/docs/Feature Plans/` | 30 days | Domain update or DELETE |
| ADR | `/docs/adr/` | Permanent | Supersede only |
| Domain Reference | `/docs/domains/` | Permanent | Update in place |
| Source of Truth | Various | Permanent | Update in place |

---

## Token Budgets and Chunking

```yaml
token_budgets:
  document_max_tokens: 2000
  section_max_tokens: 400
  tldr_bullets_max: 5
  contract_max_lines: 30
chunking:
  max_heading_depth: 3
  max_lines_per_heading: 120
  require_anchor_per_h2: true
summaries:
  per_anchor_summary: true
  summary_token_limit: 40
```

---

## Automation Hooks

```yaml
automation:
  verify_command: "pnpm run docs:verify"
  checks:
    - name: directory-schema
      description: "Validate structure matches Directory Schema"
    - name: metadata
      description: "All docs have required front matter fields"
    - name: token-budget
      description: "tokens_estimate within limits"
    - name: ttl-enforcement
      description: "ttl_expires_on honored for temporary docs"
    - name: index-sync
      description: "docs-index.yaml reflects actual files"
  git_hooks:
    - hook: pre-commit
      run: "pnpm run docs:verify"
  ci_jobs:
    - name: docs-structure
      command: "pnpm run docs:verify -- --strict"
```

---

## Dependency Registry (`docs-index.yaml`)

```yaml
docs_index:
  version: 1
  documents:
    - id: doc.availability
      path: docs/domains/availability-reference.md
      tokens_estimate: 900
      tags: [availability, scheduling]
      anchors:
        - id: contract
          summary: "Constraints for availability slots"
        - id: implementation
          summary: "Patterns for creating/editing slots"
      depends_on:
        - doc.timezone
        - adr.012
      last_verified: 2025-01-02
```

---

## Audit Protocol

### Weekly
- [ ] Delete investigations older than 2 weeks
- [ ] Delete or update stale feature plans

### Monthly
- [ ] Verify markdown links resolve
- [ ] Verify anchor links resolve
- [ ] Confirm master reflects domain docs

---

## Prohibited Patterns

### Never Create
❌ Separate guide and standard for same domain
❌ Work summaries or changelogs
❌ Bug reports or bugfix docs
❌ Documents without single purpose
❌ Documents >300 lines without table of contents
❌ Vague titles: "notes", "misc", "stuff"
❌ Files at `/docs/` root except master, testing, development
❌ Multiple files for same domain
❌ Folders with only 1 file

### Never Update Without
❌ Verifying cross-references work
❌ Updating master if architectural
❌ Checking for content to consolidate
