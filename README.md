# Dossier

**The human judgement and context control layer for production-grade AI coding.**

Closing the gap between vibe coding and production, Dossier help you build multiple features with multiple agents, in complex code - with full control and transparency.

Start with an idea or plug in existing software. Map your users' real workflows. Dossier builds the right context in the right place, keeping agents focused in large code bases. Vector memory means agents learn and share learnings with every commit - agents become experts in your software over time.

## Quick Start

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com/)
- **GitHub token** (for PR creation) — [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope

### Install and Run

```bash
git clone https://github.com/your-org/dossier.git
cd dossier
npm install   # or pnpm install
npm run build
npm run dossier
```

Your browser opens to `http://localhost:3000`. On first run, you'll be guided through API key setup.

### Development Mode

```bash
npm run dev
```

Starts Next.js in development mode with hot reload on port 3000.

## How It Works

1. **Describe your idea** — Chat with the planning agent to generate an implementation roadmap
2. **Shape the plan** — Review workflows, activities, and cards on the story map canvas
3. **Set context** — Approve planned files, add requirements, answer questions per card
4. **Finalize** — Click "Finalize Project" to generate context docs and e2e tests from your plan; click "Finalize" on each card to confirm build readiness
5. **Build** — Trigger agents to build card-by-card with precise boundaries (requires finalized cards)
6. **Review** — Monitor runs, approve PRs, iterate

## Architecture

Dossier runs as a standalone Next.js app on your machine. All data stays local.

```
~/.dossier/
  config       ← API keys and settings
  dossier.db   ← SQLite database
  ruvector/    ← Vector embeddings (future)
```

| Component | Technology |
|-----------|------------|
| UI + API | Next.js (React 19) |
| Database | SQLite (via better-sqlite3) |
| Planning LLM | Anthropic Claude |
| Build agents | agentic-flow (local, in-process) |
| Embeddings | RuVector (local WASM) |

## Configuration

API keys can be set via the web setup at `/setup` or by editing `~/.dossier/config` directly:

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

See [`.env.example`](.env.example) for all available options.

### Environment Variable Precedence

1. `process.env` (shell environment / `.env.local`)
2. `~/.dossier/config`

## CLI Options

```bash
npm run dossier                  # Start on port 3000
npm run dossier -- --port 8080   # Custom port
npm run dossier -- --no-open     # Don't open browser
npm run dossier -- --help        # Show help
```

## Development

```bash
npm run dev              # Dev server with hot reload (port 3000)
npm run build            # Production build
npm run start            # Start production server
npm run test             # Run full test suite
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report
npm run test:planning    # Planning LLM tests (mocked)
npm run test:planning:e2e # Planning E2E (trading card marketplace)
npm run test:db          # DB adapter tests
npm run test:e2e:adaptive # Adaptive E2E flows
npm run lint             # ESLint
npm run rebuild          # Rebuild and restart (dev)
npm run rebuild:prod     # Rebuild and restart (prod)
```

## Documentation

Full documentation lives in [`docs/`](docs/):

| Category | Key docs |
|----------|----------|
| **Overview** | [System Architecture](docs/SYSTEM_ARCHITECTURE.md) |
| **Getting started** | [Development](docs/development-reference.md), [Testing](docs/testing-reference.md), [Configuration](docs/reference/configuration-reference.md) |
| **Domains** | [Data contracts](docs/domains/data-contracts-reference.md), [API](docs/domains/api-reference.md), [Planning](docs/domains/planning-reference.md), [Map](docs/domains/map-reference.md), [Mutation](docs/domains/mutation-reference.md), [Orchestration](docs/domains/orchestration-reference.md), [Memory](docs/domains/memory-reference.md) |
| **Product** | [User workflows](docs/product/user-workflows-reference.md), [User personas](docs/product/user-personas.md), [User stories](docs/product/user-stories.md) |
| **Strategy** | [Dual LLM integration](docs/strategy/dual-llm-integration-strategy.md), [Finalization phase](docs/strategy/finalization-phase-strategy.md), [Worktree management](docs/strategy/worktree-management-flow.md) |
| **Reference** | [API endpoints](docs/reference/api-endpoints.md), [Database schema](docs/reference/database-schema.md) |
| **Plans** | [Remaining work plan](docs/plans/remaining-work-plan.md) |
| **ADR** | [Architecture decisions](docs/adr/) |

See [docs/README.md](docs/README.md) for the full structure.

## License

Private — not yet published.
