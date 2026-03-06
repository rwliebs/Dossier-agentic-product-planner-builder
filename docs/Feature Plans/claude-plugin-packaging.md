---
document_id: plan.claude-plugin-packaging
last_verified: 2026-03-06
tokens_estimate: 300
ttl_expires_on: 2026-04-06
tags:
  - feature-plan
  - distribution
  - claude-code
---
# Feature: Claude Code Plugin Packaging

**Status**: Proposed
**Target**: TBD

## Problem
Dossier is a standalone Next.js app. Users of Claude Code (CLI/IDE) cannot access Dossier workflows without running the full app. A plugin would let Claude Code users invoke Dossier-style planning, build, and review skills directly.

## Solution

### Plugin Package
- Separate plugin directory (e.g. `dossier-claude-plugin/`) with `.claude-plugin/plugin.json`
- Skills: `plan`, `review`, `build` (invoke Dossier workflows via prompts or API calls)
- Optional agents: `dossier-craft` for workflow guidance
- Optional MCP server: calls running Dossier instance via HTTP API

### Marketplace
- Self-hosted marketplace (`marketplace.json` in a repo)
- Optionally submit to Anthropic's official marketplace

### Independent of agentic-flow
- Plugin does not include agentic-flow (plugin runs inside Claude Code, not Dossier's execution plane)
- If plugin needs build triggers, it calls the Dossier API

## Impact
- Files: New directory `dossier-claude-plugin/` (or separate repo)
- Breaking changes: No (additive; app unchanged)
- Migration: No

## Acceptance Criteria
- [ ] Plugin installs into Claude Code and skills appear in `/help`
- [ ] `/dossier:plan` skill produces structured workflow output
- [ ] MCP server (if implemented) can list projects and create cards when Dossier is running
