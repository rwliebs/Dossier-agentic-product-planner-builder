---
document_id: doc.memory
last_verified: 2026-02-18
tokens_estimate: 600
tags:
  - memory
  - ruvector
  - embeddings
anchors:
  - id: contract
    summary: "RuVector local WASM; card-scoped approved first; never rejected"
  - id: flow
    summary: "ingestion → store; retrieval → card/project; harvest post-build"
  - id: policy
    summary: "Approved items only for retrieval; rejected excluded"
ttl_expires_on: null
---
# Memory Domain Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md), [dual-llm-integration-strategy.md](../strategy/dual-llm-integration-strategy.md)

## Contract

### Invariants
- INVARIANT: Retrieval includes only approved knowledge items; never rejected
- INVARIANT: Card-scoped memory preferred over project-scoped for build context
- INVARIANT: MemoryStore abstracts RuVector; mock when RuVector unavailable

### Boundaries
- ALLOWED: ingest card/context; retrieve for card; harvest post-build
- FORBIDDEN: Storing rejected items for retrieval; bypassing approval filter

---

## Implementation

### Flow
```
Ingestion: Card context, requirements, planned files (approved)
  → embed via RuVector
  → store in memory_unit (Postgres/SQLite) + RuVector index

Retrieval: cardId, projectId, contextSummary
  → MemoryStore.retrieveForCard (card-scoped first, then project-scoped)
  → semantic search → fetch content from DB
  → return content strings for swarm context

Harvest: Post-build
  → extract learnings from swarm memory
  → write MemoryUnit; append to RuVector
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/memory/ingestion.ts` | Ingest card context for build |
| `lib/memory/retrieval.ts` | retrieveForCard |
| `lib/memory/harvest.ts` | Post-build learning extraction |
| `lib/memory/store.ts` | MemoryStore interface; real/mock |
| `lib/memory/embedding.ts` | Embedding via RuVector |
| `lib/ruvector/client.ts` | RuVector client |

### Tables
- memory_unit: id, project_id, card_id, content, embedding_ref, status, source
- memory_unit_relation: links between units (optional)

### Retrieval Policy
1. Card-scoped approved memory first
2. Project-scoped approved memory
3. Never include rejected items

---

## Verification
- [ ] Retrieval excludes rejected knowledge items
- [ ] Mock store used when RuVector unavailable
- [ ] Harvest writes new MemoryUnit with embedding_ref

## Related
- [memory-coordination-prompt.md](../reference/memory-coordination-prompt.md)
- [orchestration-reference.md](orchestration-reference.md)
