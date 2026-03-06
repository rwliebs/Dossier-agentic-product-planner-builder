---
document_id: plan.memory-system-improvements
last_verified: 2026-03-06
tokens_estimate: 900
ttl_expires_on: 2026-06-06
tags:
  - feature-plan
  - memory
  - ruvector
  - embeddings
---
# Feature: Memory System Improvements

**Status**: Proposed
**Target**: TBD
**User Stories**: N/A

## Problem

The memory plane currently uses RuVector as a flat vector store with static HNSW search. Retrieval quality never improves, stale/duplicate entries accumulate without bound, and learnings are locked to individual projects. RuVector ships with GNN, SONA, attention, and graph capabilities that are present as transitive dependencies but unused. This document catalogues eight improvements ordered by impact and effort.

## As-Built Baseline

- `ruvector-core` for HNSW vector index (insert, search, delete, get)
- `ruvector-onnx-embeddings-wasm` with all-MiniLM-L6-v2 (384-dim)
- SQLite for content storage, scoping relations, retrieval logs
- Ingestion on card finalize, harvest post-build, snapshots on status transitions
- Retrieval: card-scoped first, then project-scoped, static cosine similarity ranking
- Feature-flagged via `MEMORY_PLANE`; mock store fallback when RuVector unavailable

## Improvements

### 1. GNN Self-Learning Retrieval

**Impact**: High | **Effort**: 2–3h | **Dependencies**: `@ruvector/gnn`

Wire the GNN layer to use build outcome signals as implicit relevance feedback. When a build succeeds after retrieving certain memory units, upweight those units for similar future queries. When a build fails, deprioritize those retrieval patterns.

- **Existing groundwork**: `snapshots.ts` already captures `buildOutcome` (success/failed) per card. `memory_retrieval_log` records every query and result set. `multi-agent-swarm.md` lists this as a planned capability.
- **Implementation path**: After each build completion, correlate `memory_retrieval_log` entries for that card's most recent retrieval with the build outcome. Feed (query, result_ids, outcome) triples into GNN training. Use trained weights to re-rank HNSW results before scope filtering.
- **Acceptance**: Retrieval ranking measurably changes after 10+ builds; builds with GNN-ranked context show equal or better check pass rate.

### 2. Retrieval Quality Observability

**Impact**: High | **Effort**: 2–3h | **Dependencies**: None (extends existing `memory_retrieval_log`)

Close the feedback loop between retrieval and build outcomes so improvements can be measured.

- **Existing groundwork**: `memory_retrieval_log` captures query_text, scope, result_ids, created_at. `logRetrieval()` writes on every retrieval. `.cursor/agents/cross-project-memory.md` requires logging.
- **Implementation path**: Track which retrieved memory units were actually included in agent context (vs truncated by token budget). Correlate retrieval results with build outcomes via `orchestration_run` → `card_assignment` → build status. Surface precision proxy metrics via the `/api/projects/[projectId]/memory` endpoint. Add a retrieval effectiveness score (% of retrieved units from builds that succeeded).
- **Acceptance**: Memory API returns retrieval stats; correlation between retrieval quality and build success is queryable.

### 3. Memory Decay and Compaction

**Impact**: Medium | **Effort**: 4–5h | **Dependencies**: None

Prevent unbounded index growth and retrieval quality degradation over time.

- **Existing groundwork**: `memory_unit.updated_at` exists but is unused in retrieval scoring. No deduplication, TTL, or compaction logic exists anywhere.
- **Implementation path**:
  - **Temporal decay**: Weight `updated_at` recency in retrieval scoring (recent learnings rank higher).
  - **Deduplication**: Before insertion, check cosine similarity of new embedding against existing units in scope. Skip if similarity > 0.95 (near-duplicate).
  - **Compaction**: Periodic job merges related learnings (same card, same project, high mutual similarity) into consolidated units. Reduces index size while preserving knowledge.
- **Acceptance**: Index growth rate is sublinear relative to build count; duplicate content is not stored; retrieval precision does not degrade over 50+ builds.

### 4. Graph-Based Relationship Queries

**Impact**: Medium-High | **Effort**: 4–6h | **Dependencies**: `@ruvector/graph-node`

Use the graph layer to traverse relationships beyond flat card/project scoping.

- **Existing groundwork**: `memory_unit_relation` models a graph (units linked to cards, projects, workflows, activities with typed roles). `.cursor/agents/cross-project-memory.md` references "derived stores (vectors/graphs)." Retrieval currently treats relations as flat sets.
- **Implementation path**: Use graph traversal to find:
  - Sibling card context (units from cards in the same workflow).
  - File-affinity context (learnings from cards that modified the same planned files).
  - Requirement-similarity context (units from cards sharing similar requirements).
  - Add a `retrieveByGraph()` method to `MemoryStore` alongside the existing `search()`.
- **Acceptance**: Retrieval can surface relevant memory from related cards, not just the current card and project.

### 5. Embedding Model Upgrade

**Impact**: Medium | **Effort**: 1–2h | **Dependencies**: None (config change + re-embed)

Replace all-MiniLM-L6-v2 (2021-era) with a newer model that better handles code and technical content.

- **Existing groundwork**: `EMBEDDING_MODEL` env var exists in `embedding.ts`. `configuration-reference.md` documents it. `multi-agent-swarm.md` mentions fastembed as an alternative.
- **Implementation path**: Evaluate `bge-small-en-v1.5` (384-dim, same footprint, better retrieval benchmarks) or `nomic-embed-text-v1.5`. Swap model name in config. Write a one-time re-embed migration script that reads all `memory_unit` content, generates new embeddings, and replaces vectors in RuVector. Document the upgrade path.
- **Acceptance**: New model scores higher on MTEB retrieval benchmarks for code/technical content; re-embed script completes without data loss.

### 6. SONA Adaptive Routing

**Impact**: Medium | **Effort**: 3–4h | **Dependencies**: `@ruvector/sona`

Auto-tune retrieval parameters to workload patterns instead of using fixed values.

- **Existing groundwork**: `@ruvector/sona` is a transitive dependency. Retrieval uses fixed `k: limit * 5`, no configurable `efSearch`, and static card-vs-project weighting.
- **Implementation path**: Let SONA learn optimal `k` multiplier, `efSearch`, and scope weighting based on retrieval-to-build-outcome correlation. Different project types (UI-heavy vs API-heavy) likely need different strategies. Optionally use SONA to adaptively compress embeddings for rarely-retrieved units.
- **Acceptance**: Retrieval parameters adapt per-project; no manual tuning required; retrieval latency stays under budget.

### 7. Attention-Enhanced Retrieval

**Impact**: Medium | **Effort**: 3–4h | **Dependencies**: `@ruvector/attention`

Replace flat cosine similarity with attention-weighted retrieval that considers structural position.

- **Existing groundwork**: `@ruvector/attention` is a transitive dependency with 46 mechanisms. Retrieval currently does "search then filter by scope."
- **Implementation path**: Use graph attention (weight by structural importance in the knowledge graph) or hyperbolic attention (natural fit for the project → workflow → activity → card hierarchy). A memory unit that is both semantically relevant and structurally adjacent should rank higher than one that is only semantically close.
- **Acceptance**: Retrieval ranking incorporates structural position; benchmark shows improved relevance over pure cosine similarity.

### 8. Cross-Project Memory Transfer

**Impact**: High | **Effort**: 6–8h | **Dependencies**: Items 1–2 (feedback loop needed to identify transferable learnings)

Enable learnings to flow across project boundaries where appropriate.

- **Existing groundwork**: `.cursor/agents/cross-project-memory.md` has a full design (purpose, storage, scoping, retrieval policy, write path, execution checklist). Memory is currently strictly project-scoped via `memory_unit_relation`.
- **Implementation path**:
  - Add a "global" scope tier above project-scoped in `memory_unit_relation`.
  - Use GNN or heuristic rules to identify universally applicable learnings (e.g. "always add error boundaries around async components") vs project-specific ones.
  - Opt-in cross-project retrieval with appropriate ranking (project-scoped > global > other-project).
  - UI for managing global memory (promote/demote units).
- **Acceptance**: Learnings from Project A are retrievable in Project B when relevant; no scope leakage for project-specific content.

## Priority Order

| Priority | Improvement | Impact | Effort | Prerequisite |
|----------|------------|--------|--------|-------------|
| 1 | GNN Self-Learning Retrieval | High | 2–3h | None |
| 2 | Retrieval Quality Observability | High | 2–3h | None |
| 3 | Memory Decay and Compaction | Medium | 4–5h | None |
| 4 | Graph-Based Relationship Queries | Medium-High | 4–6h | None |
| 5 | Embedding Model Upgrade | Medium | 1–2h | None |
| 6 | SONA Adaptive Routing | Medium | 3–4h | None |
| 7 | Attention-Enhanced Retrieval | Medium | 3–4h | None |
| 8 | Cross-Project Memory Transfer | High | 6–8h | Items 1–2 |

## Impact

- Files: `lib/memory/`, `lib/ruvector/`, `lib/db/sqlite-migrations/`
- Breaking changes: No (all additive; existing retrieval remains fallback)
- Migration: Item 5 requires re-embedding; Item 8 requires new scope tier in `memory_unit_relation`

## Related

- [memory-reference.md](../domains/memory-reference.md) — Current memory domain contract
- [multi-agent-swarm.md](multi-agent-swarm.md) — GNN self-learning originally proposed here
- [hosted-multi-user.md](hosted-multi-user.md) — Persistent volume for RuVector at scale
- [cross-project-memory agent](../../.cursor/agents/cross-project-memory.md) — Design for cross-project scoping
