---
document_id: plan.execution-agent-size-reduction
last_verified: 2026-03-06
tokens_estimate: 250
ttl_expires_on: 2026-04-06
tags:
  - feature-plan
  - optimization
  - orchestration
---
# Feature: Execution Agent Package Size Reduction

**Status**: Proposed
**Target**: TBD

## Problem
The task description sent to the build agent is large (~4k chars of inline Phase 1/Phase 3 scripts + unbounded inlined context artifact content). This wastes tokens and leaves less room for card-specific context.

## Solution

### Phase 1: Scripts in Agent Definition
- Move Phase 1 (Process Check) and Phase 3 (Completion Verification) into a Dossier-specific coder agent system prompt
- Create agent definition at `.claude/agents/dossier-coder.md` (or equivalent)
- Replace `getAgent("coder")` from agentic-flow with local agent loader
- Task references phases briefly: "Complete Phase 1 per your system instructions"
- Saves ~4k chars per run

### Phase 2: Context Artifacts by Path
- On dispatch, write each context artifact to `worktree_path/.dossier/context/<name>.md`
- Task lists paths and types only; agent uses `Read` to load content on demand
- Removes all artifact body text from the task
- Fallback: inline content if worktree write fails

## Impact
- Files: `lib/orchestration/build-task.ts`, `agentic-flow-client.ts`, new agent definition
- Breaking changes: No (task content changes but agent behavior unchanged)
- Migration: No

## Acceptance Criteria
- [ ] Task description no longer contains Phase 1/Phase 3 script bodies
- [ ] Agent system prompt includes Phase 1/Phase 3 content
- [ ] Context artifacts written to worktree; task contains paths only
- [ ] Token usage per build run measurably reduced
