---
name: cross-project-memory
description: Designs and executes efficient cross-project and long-term memory so agents build apps better. Use when adding or improving memory that spans projects, sessions, or runs; when defining what to remember, how to scope it, and how to retrieve it for agent context.
---

# Goal

Design and execute cross-project memory that improves how agents build applications: reuse learnings, avoid repeated mistakes, and stay within correct scope without leaking context across boundaries.

# 1. Define the Memory Purpose

For each request, clarify:

- What should be remembered (decisions, outcomes, patterns, failures, approvals).
- Who consumes it (which agents, which runs, which projects).
- Why it helps (e.g. fewer regressions, consistent patterns, faster convergence).

Format:

- [ ] Purpose: [exact statement]
- [ ] Consumers: [agents/runs/projects]
- [ ] Success criteria: [how we know memory is effective]

# 2. Model Storage and Boundaries

Design where memory lives and how it is scoped:

- **Content vs indexes**: What is canonical content (e.g. relational store) vs derived data (e.g. vectors, graphs) and how they reference each other.
- **Scoping**: Project, card, workflow, run — and what must never cross (e.g. no project A memory in project B unless explicitly shared).
- **Provenance**: Every memory unit should link to source (project, card, run, approval state) for filtering and audit.

RULE: content writes are source of truth; derived stores (vectors/graphs) must not block or override content writes.
RULE: retrieval must respect scope — never return memory from a different scope unless policy allows.

Format:

- [ ] Content store: [where full content lives]
- [ ] Derived stores: [vectors/graphs, reference only]
- [ ] Scopes: [list and hierarchy, e.g. card < workflow < project]
- [ ] Provenance fields: [required metadata per unit]

# 3. Retrieval Policy

Define when and how memory is read:

- **When**: Before run (seed), during run (optional), after run (for harvest only — write path).
- **Ranking**: By relevance (e.g. semantic similarity), recency, scope (e.g. card-scoped before project-scoped).
- **Filtering**: Approved-only, never rejected; optional status or quality gates.
- **Limits**: Max units or token budget per retrieval to keep context bounded.

RULE: retrieval must be logged (what was asked, what was returned) for debugging and policy tuning.
RULE: retrieval must be deterministic enough to test (e.g. mock store, fixed scope).

Format:

- [ ] Seed trigger: [when we run retrieval before a run]
- [ ] Ranking order: [e.g. card-scoped first, then project-scoped; then by score]
- [ ] Exclusions: [rejected, unapproved, …]
- [ ] Limit: [max units or tokens]
- [ ] Logging: [what to record]

# 4. Write Path: Ingestion and Harvest

Define when memory is written and how it is derived:

- **Ingestion**: When new units are created (e.g. on approval, on build trigger). Content → store; then derive embeddings/indexes asynchronously if needed.
- **Harvest**: After a run — extract durable learnings from run output, convert to units, store content and (async) derived data. Link to source card/project/run.

RULE: ingestion and harvest must not block the main flow (e.g. approval or run completion). Use async or fire-and-forget for heavy work.
RULE: if the derived store (e.g. vector DB) is unavailable, persist content only and skip or defer indexing; never fail the write.

Format:

- [ ] Ingestion triggers: [events that create memory units]
- [ ] Harvest triggers: [post-run, what to extract]
- [ ] Fallback when derived store down: [behavior]
- [ ] Provenance attached: [card_id, project_id, run_id, …]

# 5. Execution Checklist

When implementing or reviewing cross-project memory:

- [ ] Content and metadata have a single source of truth (relational or equivalent).
- [ ] Scoping and provenance are explicit and enforced in retrieval.
- [ ] Seed runs before execution; harvest runs after; neither blocks critical path.
- [ ] Retrieval is logged and limited; exclusions (e.g. rejected) applied.
- [ ] Fallback when vector/graph store unavailable (e.g. mock or content-only).
- [ ] Tests use a mock store or gated integration so behavior is verifiable.

# 6. Output Contract

When advising on cross-project memory, return:

1. Purpose and success criteria (section 1).
2. Storage and boundaries (section 2).
3. Retrieval policy (section 3).
4. Write path: ingestion and harvest (section 4).
5. Execution checklist filled for the current design.
6. Risks and trade-offs (e.g. staleness, scope leakage, cost of indexing).

Prefer concrete, project-appropriate guidance over generic advice. Do not assume a specific technology (e.g. RuVector or FalkorDB); recommend patterns that work with the stack in use.
