---
document_id: doc.configuration
last_verified: 2026-03-23
tokens_estimate: 700
tags:
  - configuration
  - env
  - config
anchors:
  - id: precedence
    summary: "process.env > .env.local > ~/.dossier/config"
  - id: required
    summary: "Anthropic planning credential + GITHUB_TOKEN"
  - id: optional
    summary: "DB pathing, model selection, runtime tuning, feature flags"
ttl_expires_on: null
---
# Configuration Reference

**Anchors**: [development-reference.md](../development-reference.md)

## Contract

- INVARIANT: Config precedence is `process.env` > `.env.local` > `~/.dossier/config`
- INVARIANT: `/setup` writes to `~/.dossier/config` and updates `process.env` for immediate use
- INVARIANT: Planning credential resolution is env/config first, then Claude CLI settings

Planning credential resolution order:
1. `process.env.ANTHROPIC_API_KEY`
2. `~/.dossier/config` -> `ANTHROPIC_API_KEY`
3. Claude CLI settings (`~/.claude/settings.json`, or `CLAUDE_CONFIG_DIR/settings.json`):
   - `env.ANTHROPIC_API_KEY`, else
   - `env.ANTHROPIC_AUTH_TOKEN` (also mapped to `CLAUDE_CODE_OAUTH_TOKEN`)

---

## Required

| Variable | Required for | Notes |
|----------|--------------|-------|
| `ANTHROPIC_API_KEY` | Planning/build LLM access | Optional if Claude CLI credential is available via settings.json |
| `GITHUB_TOKEN` | Push/sync branch operations | Required by `/api/projects/[projectId]/cards/[cardId]/push` and `/api/projects/[projectId]/repo/sync` |

Token guidance:
- Classic token: `repo` scope
- Fine-grained token: repository `Contents` write permission

---

## Optional Runtime Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_DRIVER` | `sqlite` | Database driver selector; `postgres` currently not implemented at runtime |
| `DATABASE_URL` | — | Checked when `DB_DRIVER=postgres`; runtime throws if postgres selected |
| `DOSSIER_DATA_DIR` | `~/.dossier` | Base data directory |
| `SQLITE_PATH` | `~/.dossier/dossier.db` | Explicit SQLite path override |
| `PLANNING_LLM_MODEL` | `claude-haiku-4-5-20251001` | Planning model override |
| `COMPLETION_MODEL` | `claude-sonnet-4-5-20250929` | Build execution model override |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Memory embedding model |
| `DOSSIER_STALE_RUN_MINUTES` | `0` | Stale run timeout; `0` disables timeout |
| `DOSSIER_PRE_AUTOCOMMIT_DELAY_MS` | `2000` | Delay before webhook/auto-commit after execution completion |
| `PLANNING_DEBUG` | unset | Extra planning diagnostics when set to `1` |

---

## Feature Flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_PLANNING_LLM_ENABLED` | `true` | Enables chat/chat-stream planning endpoints |
| `NEXT_PUBLIC_BUILD_ORCHESTRATOR_ENABLED` | `true` | Enables orchestration/build routes |
| `NEXT_PUBLIC_MEMORY_PLANE_ENABLED` | `true` | Enables memory ingestion/retrieval flows |

---

## Test-Only

| Variable | Purpose |
|----------|---------|
| `PLANNING_MOCK_ALLOWED` | `1` enables mock LLM payload support in planning routes/tests |

---

## Config File Format

Both `.env.local` and `~/.dossier/config` use:

```bash
KEY=value
KEY="value with spaces"
# comments ignored
```

`/api/setup` accepts:

```json
{
  "anthropicApiKey": "optional string",
  "githubToken": "optional string"
}
```

At least one key must be present.

---

## Troubleshooting

### Setup loop redirects back to `/setup`
Check `/api/setup/status`:
- `missingKeys` includes `GITHUB_TOKEN` -> add token via `/setup` or config file
- `missingKeys` includes `ANTHROPIC_API_KEY` and `anthropicViaCli=false` -> provide key or ensure Claude CLI is installed/authenticated

### Push/sync returns 401 or auth error
- Ensure `GITHUB_TOKEN` is present in env or `~/.dossier/config`
- Verify token scope/permissions for target repo

### `DB_DRIVER=postgres` fails at runtime
- Current runtime implementation supports SQLite only
- Use default `DB_DRIVER=sqlite`

---

## Verification
- [ ] `/api/setup/status` reports expected `needsSetup` and `missingKeys`
- [ ] `/api/setup` persists values to `~/.dossier/config`
- [ ] Push/sync routes succeed with configured `GITHUB_TOKEN`

## Related
- [.env.example](../../.env.example)
- [lib/config/data-dir.ts](../../lib/config/data-dir.ts)
- [lib/llm/planning-credential.ts](../../lib/llm/planning-credential.ts)
