---
document_id: doc.development
last_verified: 2026-03-30
tokens_estimate: 700
tags:
  - development
  - setup
  - workflow
anchors:
  - id: setup
    summary: "Node 20+, npm install, .env.local or ~/.dossier/config"
  - id: scripts
    summary: "dev, build, test, dossier, rebuild"
  - id: ports
    summary: "3000 frontend; kill/restart per user rules"
ttl_expires_on: null
---
# Development Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [reference/configuration-reference.md](reference/configuration-reference.md)

## Contract

- INVARIANT: Frontend port 3000; backend 8000 when applicable
- INVARIANT: Kill and restart servers rather than using higher ports
- INVARIANT: Run tests before commit; type-check before push

---

## Setup

### Prerequisites
- Node.js 20+
- Anthropic API key
- GitHub token (repo scope) for PR creation

### Install

Use **pnpm** or **npm** to install dependencies (pnpm recommended if npm has auth/token issues):

```bash
pnpm install   # or: npm install
```

### Configuration
- **Development**: Copy `.env.example` to `.env.local`; fill `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`
- **Self-deploy**: Use `/setup` or edit `~/.dossier/config`
- Precedence: `process.env` > `.env.local` > `~/.dossier/config`
- Planning can run through Claude CLI auth when API key is absent; build orchestration still requires `ANTHROPIC_API_KEY`

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server (port 3000) |
| `npm run build` | Production build + postbuild (standalone) |
| `npm run start` | Start production server |
| `npm run dossier` | Run standalone CLI (opens browser) |
| `npm run test` | Run Vitest suite |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |
| `npm run rebuild` | Rebuild and restart (dev) |
| `npm run rebuild:prod` | Rebuild and restart (prod) |

---

## Data Directory

Default: `~/.dossier/`

```
~/.dossier/
  config       # API keys, settings (KEY=VALUE)
  dossier.db   # SQLite database
  ruvector/   # Vector embeddings (future)
```

Override: `DOSSIER_DATA_DIR` or `SQLITE_PATH`

---

## Workflow

1. Create feature branch: `git checkout -b feature/task-name`
2. Make changes; run `npm run test` and `npm run lint`
3. Commit with descriptive message
4. Rebase on main before merge

---

## Operational Runbook (Common Tasks)

### Sync local clone after merging on GitHub

Use:

`POST /api/projects/[projectId]/repo/sync`

This fetches and syncs local `<default_branch>` in `~/.dossier/repos/<projectId>/` to `origin/<default_branch>`.

### Push a completed card branch

Use:

`POST /api/projects/[projectId]/cards/[cardId]/push`

Requires:
- Connected repository on project
- Completed assignment for the card
- `GITHUB_TOKEN` configured

### View app from cloned project during development

Use:

`POST /api/dev/restart-and-open` with `{ "projectId": "..." }`

Behavior:
- Dev-only (`NODE_ENV=development`)
- Starts `npm run dev` in clone path
- Picks first free port in `3001..3010`

---

## Troubleshooting

- **Planning works but build trigger fails with Anthropic credential error**
  - Planning may be running via Claude CLI auth.
  - Build path uses orchestration/Agent SDK and requires `ANTHROPIC_API_KEY`.
- **Push/sync endpoints failing with auth errors**
  - Verify `GITHUB_TOKEN` is set in env or `~/.dossier/config`.
- **Finalize blocked**
  - Card finalize requires project finalized state, at least one requirement, and at least one planned file.

---

## Verification
- [ ] `npm run dev` starts on 3000
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds

## Related
- [testing-reference.md](testing-reference.md)
- [reference/configuration-reference.md](reference/configuration-reference.md)
- [README.md](../README.md)
