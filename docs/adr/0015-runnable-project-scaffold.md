# ADR 0015: Runnable Project Scaffold at Finalization

**Date**: 2026-02-22
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#data-flow, docs/adr/0010-finalization-phase-design.md

## Context

After project finalization creates directory structure and context documents, the repo may not be runnable (no `package.json`, no framework config, no app entry). Build agents then waste tokens creating boilerplate instead of implementing card-specific functionality.

## Decision

Scaffold is part of project finalization. A 6th parallel LLM call produces a "project-scaffold" `ContextArtifact` containing the minimal root files for the project's tech stack. The handler parses the artifact, writes files to the repo clone (skipping files that already exist), and commits.

**Output format**: Markdown with `### FILE: <path>` blocks containing file contents. Parsed by `parseScaffoldFiles()` in `lib/orchestration/parse-scaffold-files.ts`.

**Separation of concerns**:
- `createRootFoldersInRepo`: directories + `.gitkeep` from architectural summary
- `writeScaffoldFilesToRepo`: file contents from scaffold artifact; skips existing files

**Graceful degradation**: if scaffold LLM call fails, finalization still succeeds; repo may not be runnable until the build agent adds root files.

## Consequences

- Repos are runnable (`npm install && npm run dev`) immediately after finalization
- Build agents focus on card-specific code, not boilerplate
- Existing repos are not overwritten (skip-if-exists policy)

## Rollback

Remove scaffold LLM call from finalization; build agents create root files as needed.
