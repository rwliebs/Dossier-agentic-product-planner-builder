---
document_id: doc.configuration
last_verified: 2026-02-18
tokens_estimate: 600
tags:
  - configuration
  - env
  - config
anchors:
  - id: precedence
    summary: "process.env > .env.local > ~/.dossier/config"
  - id: required
    summary: "ANTHROPIC_API_KEY, GITHUB_TOKEN"
  - id: optional
    summary: "DB_DRIVER, DOSSIER_DATA_DIR, feature flags"
ttl_expires_on: null
---
# Configuration Reference

**Anchors**: [development-reference.md](../development-reference.md)

## Contract

- INVARIANT: Config precedence: `process.env` > `.env.local` > `~/.dossier/config`
- INVARIANT: Self-deploy uses `~/.dossier/config`; dev uses `.env.local`

---

## Required

| Variable | Purpose |
|----------|---------|
| ANTHROPIC_API_KEY | Planning LLM and agentic-flow; [console.anthropic.com](https://console.anthropic.com/) |
| GITHUB_TOKEN | Push branches, create PRs; [github.com/settings/tokens](https://github.com/settings/tokens) `repo` scope |

---

## Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| DB_DRIVER | sqlite | `sqlite` or `postgres` |
| DATABASE_URL | — | Postgres connection string (when DB_DRIVER=postgres) |
| DOSSIER_DATA_DIR | ~/.dossier | Data directory |
| SQLITE_PATH | ~/.dossier/dossier.db | Override SQLite path |
| EMBEDDING_MODEL | all-MiniLM-L6-v2 | RuVector embedding model |
| PLANNING_LLM_MODEL | claude-haiku-4-5-20251001 | Planning LLM model |
| DOSSIER_STALE_RUN_MINUTES | 0 | Minutes before marking stuck runs as failed. 0 = disabled (no timeout). |

---

## Feature Flags (NEXT_PUBLIC_*)

| Variable | Default | Purpose |
|----------|---------|---------|
| NEXT_PUBLIC_PLANNING_LLM_ENABLED | true | Planning chat |
| NEXT_PUBLIC_BUILD_ORCHESTRATOR_ENABLED | true | Build triggers |
| NEXT_PUBLIC_MEMORY_PLANE_ENABLED | true | Memory ingestion/retrieval |

---

## Test-Only

| Variable | Purpose |
|----------|---------|
| PLANNING_MOCK_ALLOWED | 1 = mock LLM in planning tests |

---

## Config File Format

`~/.dossier/config` or `.env.local`:

```
KEY=value
KEY="value with spaces"
# comments ignored
```

---

## Verification
- [ ] Required vars set before running
- [ ] /setup writes to ~/.dossier/config

## Related
- [.env.example](../../.env.example)
- [lib/config/data-dir.ts](../../lib/config/data-dir.ts)
