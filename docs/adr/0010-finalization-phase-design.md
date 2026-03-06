# ADR 0010: Finalization Phase Design

**Date**: 2026-02-20
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#data-flow, docs/domains/planning-reference.md#modes

## Context

After planning produces a complete story map (workflows, activities, cards), the system needs a preparation step that synthesizes build-ready context before code execution. The question was whether to finalize everything at once or in stages, and what outputs finalization should produce.

## Decision

Two-stage finalization: project-wide first, then per-card.

**Project finalization** (user clicks "Finalize Project"):
- Runs 5 LLM calls in parallel, each producing a `ContextArtifact`: architectural summary, data contracts, domain summaries, workflow summaries, design system
- Parses root folder structure from architectural summary; creates folders + `.gitkeep` in repo clone
- Parses project scaffold artifact; writes root files (package.json, configs, app entry) to repo clone
- Sets `project.finalized_at`

**Per-card finalization** (user clicks "Finalize" on a card):
- Assembles context: project-wide docs + card knowledge + e2e tests + linked artifacts
- Returns SSE stream with finalization package for user review/edit
- On confirm: sets `card.finalized_at`; card is now build-ready
- Ingests card context into memory (RuVector + SQLite)

**Test code exception**: Finalize mode may produce e2e test code as `ContextArtifact` with `type: 'test'`. Tests are specifications, not implementation code. `CardPlannedFile.artifact_kind` excludes test artifacts.

**Workflow population is incremental**: one workflow at a time via streaming populate mode. No bulk "accept all" step.

## Consequences

- Build agents receive oriented briefings (5 focused documents), not a search index dump
- User controls the gate at both project and card level
- Scaffold files make the repo immediately runnable after project finalization
- Per-card finalize ensures memory is seeded before build dispatch

## Rollback

Revert to unfinalized builds where agents receive raw card data without synthesized context.
