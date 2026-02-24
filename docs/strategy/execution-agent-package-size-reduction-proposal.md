# Proposal: Reduce Execution Agent Package Size

## Goal

Shrink the payload sent to the execution agent (task description + system prompt) so each run uses fewer tokens and leaves more room for card-specific content. Two main size drivers today: ~4k chars of inline Process Check and Completion Verification scripts in every task, and unbounded inlined context-artifact content.

---

## Proposal (single path)

**Phase 1 — Scripts in agent definition:** Move Phase 1 (Process Check) and Phase 3 (Completion Verification) out of the task and into a **Dossier-specific coder agent** system prompt. The task only references the phases ("Complete Phase 1 per your system instructions, then implement, then Phase 3"). Saves ~4k characters per run and matches existing R7 in [investigation-build-only-readme](../investigations/investigation-build-only-readme.md).

**Phase 2 — Context artifacts by path:** When dispatching, write each context artifact into the **target worktree** under `.dossier/context/` (e.g. `.dossier/context/<artifact-name>.md`). The task lists only paths and types ("Context: read `.dossier/context/foo-spec.md` (spec), …"). The agent uses `Read` to load them. Removes all artifact body text from the task; savings scale with artifact count and size.

**Why this over the other options:**

- **Not worktree-only for scripts (Option B):** Putting Phase 1/3 in the agent keeps one source of truth in Dossier and avoids writing into every target repo and keeping templates in sync. We can add worktree scripts later for per-repo customization if needed.
- **Not truncate/cap only (Option C.2/C.3):** Writing artifacts into the worktree gives the agent full content on demand and keeps the task small without losing information. Truncation is a fallback if worktree write is not feasible for some runs.

---

## Implementation

### Phase 1: Dossier coder agent + short task

1. **Dossier agent definition** — Add a coder agent that includes the full Phase 1 and Phase 3 text in its system prompt (e.g. in Dossier at `.claude/agents/dossier-coder.md` or equivalent). Reuse or extend the existing coder behavior; append or embed the exact `PROCESS_CHECK_SCRIPT` and `COMPLETION_VERIFICATION_SCRIPT` content from [lib/orchestration/build-task.ts](../../lib/orchestration/build-task.ts).

2. **Agent resolution in client** — In [lib/orchestration/agentic-flow-client.ts](../../lib/orchestration/agentic-flow-client.ts), load the Dossier agent instead of `getAgent("coder")`. If agentic-flow's loader only reads from its package, add a small local loader that reads from Dossier's `.claude/agents/` (or a configurable path) and returns `{ name, description, systemPrompt }` so the rest of the client stays unchanged.

3. **Shorten task in build-task** — In [lib/orchestration/build-task.ts](../../lib/orchestration/build-task.ts), remove `sections.push(PROCESS_CHECK_SCRIPT)` and `sections.push(COMPLETION_VERIFICATION_SCRIPT)`. Add brief phase instructions, e.g. "Complete Phase 1 (Process Check) per your system instructions before implementing. After implementation, complete Phase 3 (Completion Verification) per your system instructions before reporting done."

4. **Tests** — In [__tests__/orchestration/build-task.test.ts](../../__tests__/orchestration/build-task.test.ts): assert the built task does not contain the long script bodies and does contain the short phase references. Optionally in agentic-flow-client tests: assert the resolved agent has a system prompt that includes Phase 1 and Phase 3 content.

### Phase 2: Context artifacts in worktree

1. **Write artifacts on dispatch** — In the dispatch path (e.g. in [lib/orchestration/dispatch.ts](../../lib/orchestration/dispatch.ts) or a small helper called before `client.dispatch()`), for each payload `context_artifacts` entry: write `art.content` to `worktree_path/.dossier/context/<sanitized-name>.md` (create `.dossier/context` if needed). Use a deterministic name (e.g. slug of `art.name` + type) so the task can reference it.

2. **Task references paths only** — In [lib/orchestration/build-task.ts](../../lib/orchestration/build-task.ts), when `context_artifacts` is present, do not inline `art.content`. Instead add a "Context artifacts" section that lists paths and types only, e.g. "Read these files for process check and implementation: `.dossier/context/foo-spec.md` (spec), `.dossier/context/bar-test.md` (test)."

3. **Payload and backward compatibility** — Keep `context_artifacts` in the payload for audit and for runs where worktree write is not possible (e.g. read-only). If writing to the worktree fails, fall back to current behavior (inline content) or to a per-artifact length cap and document the fallback.

4. **Tests** — Add tests for: artifact files created under worktree; task contains path list and not full content; and fallback when worktree is missing or read-only.

---

## Out of scope for this proposal

- **Option B (worktree scripts for Phase 1/3):** Deferred; can be added later if we want per-repo script customization.
- **SDK/agentic-flow "skills" API:** Not assumed; implementation uses system prompt and worktree files only.
