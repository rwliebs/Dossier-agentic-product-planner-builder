---
document_id: doc.memory
last_verified: 2026-02-19
tokens_estimate: 750
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
  - id: embedding-workaround
    summary: "CJS copy workaround for ruvector-onnx-embeddings-wasm ESM bug"
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
| `lib/memory/embedding.ts` | Embedding via ruvector-onnx-embeddings-wasm |
| `lib/ruvector/client.ts` | RuVector vector DB client (ruvector-core) |

### Tables
- memory_unit: id, project_id, card_id, content, embedding_ref, status, source
- memory_unit_relation: links between units (optional)

### Retrieval Policy
1. Card-scoped approved memory first
2. Project-scoped approved memory
3. Never include rejected items

### Embedding: CJS Workaround
- `ruvector-onnx-embeddings-wasm` has upstream bug: declares `"type":"module"` but WASM JS glue uses CJS globals (`__dirname`, `require`, `module.exports`)
- **Fix** (`embedding.ts` → `loadWasmModuleCjs()`): copies `.js` to `.cjs`, loads via `createRequire` so Node treats it as CJS, passes pre-loaded module to `createEmbedder(model, wasmModule)`
- Singleton uses promise pattern (`_loadPromise`) so concurrent callers share one download
- Model: `all-MiniLM-L6-v2` (384-dim, ~23MB, downloaded from HuggingFace on first use)
- FORBIDDEN: Removing the CJS workaround without verifying the upstream package is fixed

---

## Where to see stored data

To verify that memory is actually being stored:

1. **API (project-scoped)**  
   `GET /api/projects/[projectId]/memory`  
   Returns `count`, `units` (id, title, content_type, status, content_preview, link_url), and `storage` paths for SQLite and RuVector. Use any project ID after at least one card has been finalized (ingest) or one build has completed (harvest).

2. **SQLite (raw)**  
   Default path: `~/.dossier/dossier.db` (or `DOSSIER_DATA_DIR/dossier.db`).  
   ```bash
   sqlite3 ~/.dossier/dossier.db "SELECT id, title, status, substr(content_text,1,120) FROM memory_unit ORDER BY updated_at DESC LIMIT 20;"
   ```
   Relations (which unit belongs to which card/project):
   ```bash
   sqlite3 ~/.dossier/dossier.db "SELECT * FROM memory_unit_relation LIMIT 20;"
   ```

3. **RuVector (vectors)**  
   Default path: `~/.dossier/ruvector/vectors.db` (or `DOSSIER_DATA_DIR/ruvector/vectors.db`).  
   This file is the HNSW index; content is in SQLite. Vector count (if supported by ruvector-core): use the app’s memory API or SQLite `memory_unit` row count.

---

## Verification
- [x] Retrieval excludes rejected knowledge items
- [x] Mock store used when RuVector unavailable
- [x] Harvest writes new MemoryUnit with embedding_ref
- [x] Real semantic embeddings load in Vitest (not hash fallback)

## Related
- [memory-coordination-prompt.md](../reference/memory-coordination-prompt.md)
- [orchestration-reference.md](orchestration-reference.md)
