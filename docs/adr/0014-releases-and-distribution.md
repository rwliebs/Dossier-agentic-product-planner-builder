# ADR 0014: Releases and Distribution

**Date**: 2026-02-24
**Status**: Accepted
**Anchors**: docs/SYSTEM_ARCHITECTURE.md#overview

## Context

Dossier needs to be installable and runnable without cloning the repo. The app depends on `better-sqlite3` (native module) and ships a Next.js standalone build.

## Decision

Three distribution channels:

1. **npm publish** (primary): CI publishes on `v*` tags via `.github/workflows/publish.yml`. Uses npm Trusted Publisher (OIDC). Package includes `bin/`, `.next/standalone/`, `.next/static/`, `public/`.
2. **CLI entry**: `bin/dossier.mjs` loads `~/.dossier/config`, starts the standalone server on port 3000 (configurable via `--port`), opens browser.
3. **Electron desktop app**: `electron:make` produces DMG (macOS), Squirrel (Windows), deb (Linux) via Electron Forge. Spawns the standalone server in a child process.

**Auth and RLS gating** (per ADR-0007): current releases are alpha/pre-release. Production deployment deferred until auth and RLS are implemented.

**Platform caveat**: native `better-sqlite3` is built on the publish machine. Other platforms must clone and build from source.

## Consequences

- Users can run via `npx dossier-agentic-product-planner-builder` or install the Electron app
- Single publish pipeline for npm; separate `electron:make` for desktop
- Alpha releases are explicitly pre-release

## Rollback

Revert to clone-and-build-from-source only.
