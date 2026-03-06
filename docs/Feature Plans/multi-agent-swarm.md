---
document_id: plan.multi-agent-swarm
last_verified: 2026-03-06
tokens_estimate: 450
ttl_expires_on: 2026-04-06
tags:
  - feature-plan
  - orchestration
  - agents
---
# Feature: Multi-Agent Swarm Builds

**Status**: Proposed
**Target**: TBD
**User Stories**: N/A

## Problem
Build execution currently uses a single coder agent per card via `@anthropic-ai/claude-agent-sdk` `query()`. The original strategy envisioned a multi-agent swarm (architect → coder → tester → reviewer) with shared memory per build, coordinated via claude-flow MCP server. This would improve code quality through specialized agent roles and cross-agent collaboration.

## As-Built Baseline
- Single `coder` agent per card assignment
- Agent definition loaded from agentic-flow's `getAgent("coder")` (system prompt only)
- SDK `query()` called directly with `permissionMode: "bypassPermissions"`
- In-process execution; no MCP server; no external service
- Post-build: auto-commit, checks, approval lifecycle already functional

## Solution

### Multi-Agent Pipeline Per Card
- **Architect agent**: reads seeded memory, produces implementation plan, writes decisions to shared memory
- **Coder agent**: reads plan + memory, implements files, commits to feature branch
- **Tester agent**: reads implementation, writes and runs tests, writes results to shared memory
- **Reviewer agent**: checks boundary compliance and code quality, approves or requests revisions
- Each agent builds on prior agents' output via shared per-build memory namespace

### Execution Plane Options
- **Option A**: claude-flow MCP server on dedicated host (original strategy)
  - MCP over HTTP for dispatch/status/cancel
  - Persistent volume for RuVector + git checkouts
- **Option B**: In-process multi-step SDK pipeline (simpler, no infra change)
  - Sequential `query()` calls with context threading
  - Stays local; no external service dependency

### Parallel Multi-Card Builds
- Git worktree isolation per card assignment (currently sequential single-card)
- Single-build lock relaxed to per-card lock
- Integration pass agent validates cross-card compatibility before PR

### Self-Learning Memory
- GNN self-learning weights in RuVector (refine retrieval ranking over time)
- Historical card snapshots (append-only, learn from build outcomes)
- fastembed for local embedding generation (no external API cost)
- See [memory-system-improvements.md](memory-system-improvements.md) for full improvement catalogue

## Impact
- Files: `lib/orchestration/dispatch.ts`, `agentic-flow-client.ts`, `build-task.ts`, potentially new agent definitions
- Breaking changes: No (additive; single-coder remains fallback)
- Migration: No

## Acceptance Criteria
- [ ] Multi-agent pipeline produces higher-quality output than single coder (measured by check pass rate)
- [ ] Shared memory namespace enables cross-agent context threading
- [ ] Parallel multi-card builds work with git worktree isolation
- [ ] Self-learning retrieval measurably improves across sequential builds
