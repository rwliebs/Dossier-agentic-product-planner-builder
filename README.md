# Dossier

**The dashboard for orchestrating end-to-end builds with multiple agents.**

Plan workflows from ideas. Set precise agent context per feature. Trigger multi-agent builds. Review, test, and ship iteratively.

## Quick Start

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com/)
- **GitHub token** (for PR creation) — [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope

### Install and Run

```bash
git clone https://github.com/your-org/dossier.git
cd dossier
npm install
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
4. **Build** — Trigger agents to build card-by-card with precise boundaries
5. **Review** — Monitor runs, approve PRs, iterate

## Architecture

Dossier runs as a standalone Next.js app on your machine. All data stays local.

```
~/.dossier/
  config       ← API keys and settings
  dossier.db   ← SQLite database
  ruvector/    ← Vector embeddings (future)
```

| Component | Technology |
|-----------|-----------|
| UI + API | Next.js (React 19) |
| Database | SQLite (via better-sqlite3) |
| Planning LLM | Anthropic Claude |
| Build agents | claude-flow (local, in-process) |
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
npm run dev          # Dev server with hot reload
npm run build        # Production build
npm test             # Run tests
npm run lint         # Lint
```

## License

Private — not yet published.
