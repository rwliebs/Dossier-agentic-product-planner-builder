# Strategy: Packaging Dossier as a Claude Plugin (Marketplace)

**Purpose:** Clarify what “packaging Dossier as a Claude Plugin” means, how it relates to agentic-flow, and how to list on a Claude Code marketplace.

**References:**
- [Create plugins](https://code.claude.com/docs/en/plugins)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference)

---

## 1. What a Claude Plugin Is (and Isn’t)

A **Claude Plugin** extends **Claude Code** (the CLI/IDE), not the other way around.

| Concept | What it is |
|--------|------------|
| **Claude Plugin** | A package (manifest + skills/agents/hooks/MCP) that users **install into Claude Code**. It adds slash skills (e.g. `/dossier:plan`), optional subagents, hooks, or MCP servers. It runs **inside** Claude Code. |
| **Dossier app** | A **Next.js app** (UI + API) + SQLite + orchestration + execution plane. It runs as a separate process (e.g. `pnpm dev` / `next start`). |

So “packaging Dossier as a Claude Plugin” does **not** mean “run the Next.js app inside Claude Code.” It means one or both of:

- **A) Plugin only:** A **separate** plugin package that adds Dossier-related skills/agents to Claude Code (e.g. workflow guidance, or skills that call the Dossier API when the app is running).
- **B) App + plugin:** The Dossier app stays as the main product; the plugin is an optional extension so Claude Code users can invoke Dossier workflows or talk to the app via MCP/API.

The plugin directory is **self-contained**: it gets copied into Claude Code’s plugin cache. It cannot depend on the full Dossier monorepo at runtime; it can only bundle its own files or call out to a running Dossier instance (e.g. via HTTP or MCP).

---

## 2. Do We Need to “Dump agentic-flow” and Use the Claude SDK?

**Short answer: No.** Execution already uses the Claude SDK; agentic-flow is only used for agent definitions (system prompt). Removing agentic-flow is optional and independent of building a plugin.

### Current architecture (from `lib/orchestration/agentic-flow-client.ts`)

- **Execution:** `query()` from `@anthropic-ai/claude-agent-sdk` is used **directly** (with `cwd`, `persistSession: false`, allowed tools, etc.). No agentic-flow execution path in the hot loop.
- **Agent definition:** The **only** use of agentic-flow is `getAgent("coder")` from agentic-flow’s dist (loader + system prompt). That gives the coder’s system prompt for the SDK `query()` call.

So:

- You are **already** using the Claude SDK for execution.
- “Dumping agentic-flow” only means: **stop** loading the coder from agentic-flow and **ship your own** coder agent (e.g. in Dossier at `.claude/agents/dossier-coder.md` or equivalent) and a small loader that returns `{ name, description, systemPrompt }`. That’s exactly what [execution-agent-package-size-reduction-proposal.md](./execution-agent-package-size-reduction-proposal.md) describes (Phase 1: Dossier coder agent + short task).

**Conclusion:**

- **For the Dossier app:** You can remove the agentic-flow dependency by inlining the coder agent definition and a minimal loader; no need to “switch” to the SDK for execution — you’re already on it.
- **For a Claude Plugin:** The plugin runs inside Claude Code and doesn’t run agentic-flow or your Next.js app. So “dump agentic-flow for the plugin” isn’t a separate decision; the plugin simply wouldn’t include agentic-flow. If the plugin needs to trigger or guide “Dossier-style” builds, it would do so via skills/agents/MCP that call your app’s API or document workflows, not by running agentic-flow.

---

## 3. Listing on “Their” Marketplace

Two main options:

### Option A: Your own marketplace (full control)

- Create a repo (or a folder in the Dossier repo) that hosts a **marketplace**:
  - Root: `.claude-plugin/marketplace.json` with `name`, `owner`, and a `plugins` array.
  - Each plugin: a directory with `.claude-plugin/plugin.json` and components (e.g. `skills/`, `agents/`, `hooks/`, `.mcp.json`).
- Publish the repo (GitHub/GitLab, etc.).
- Users add your marketplace:  
  `/plugin marketplace add <url-or-path>`  
  then install a plugin:  
  `/plugin install <plugin-name>@<marketplace-name>`  
- You can list Dossier as a plugin in that marketplace and point `source` at a path or git repo.

### Option B: Official Anthropic marketplace

- Reserved names (e.g. `claude-code-marketplace`, `anthropic-marketplace`) indicate an official catalog. To list there, follow Anthropic’s process (typically described in [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins) or in their marketplace submission guidelines). Check the docs or support for “submit a plugin” or “publish to the marketplace.”

---

## 4. Concrete Steps to Package a Dossier Claude Plugin

### 4.1 Plugin layout (inside Dossier repo or separate repo)

Recommended layout (plugin root = e.g. `dossier-claude-plugin/` or `plugins/dossier/`):

```
dossier-claude-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── plan/           → /dossier:plan (or /dossier:plan when name is "dossier")
│       └── SKILL.md
├── agents/             (optional)
│   └── dossier-craft.md
└── README.md
```

**Important:** Do **not** put `skills/`, `agents/`, `hooks/` inside `.claude-plugin/`. Only `plugin.json` (and optional marketplace files) go in `.claude-plugin/`.

### 4.2 Minimal `plugin.json`

```json
{
  "name": "dossier",
  "description": "Dossier workflow skills: plan, orchestrate, and ship with AI-native product craft",
  "version": "1.0.0",
  "author": { "name": "Your Name or Team" },
  "repository": "https://github.com/your-org/dossier",
  "homepage": "https://github.com/your-org/dossier#readme"
}
```

### 4.3 Example skill: `skills/plan/SKILL.md`

```markdown
---
description: Plan a Dossier workflow (cards, steps, planned files) for the current project
---

When the user wants to plan work in Dossier style:
1. Elicit scope (features, acceptance criteria, constraints).
2. Propose a workflow: workflow → activities → steps → cards.
3. For each card, suggest planned files and context artifacts.
4. Output a structured summary they can paste into Dossier or use via API.

If Dossier is running (user confirms), offer to open the app or format output for their API.
```

You can add more skills (e.g. `review`, `build`, `finalize`) and optional agents/hooks/MCP as needed.

### 4.4 Optional: MCP server that talks to Dossier

If the Dossier app exposes an API, you can add an MCP server in the plugin that calls it (e.g. list projects, create cards, trigger build). That would live in the plugin as a script or `npx`-runnable server and be declared in `.mcp.json` at plugin root, using `${CLAUDE_PLUGIN_ROOT}` for paths. Then Claude Code can “talk to Dossier” when the app is running.

### 4.5 Test locally

```bash
claude --plugin-dir ./dossier-claude-plugin
```

Then in Claude Code: `/dossier:plan` (or whatever skill names you added). Run `/help` to see skills listed under the plugin.

### 4.6 Add to your marketplace

In your marketplace repo’s `.claude-plugin/marketplace.json`:

```json
{
  "name": "your-marketplace",
  "owner": { "name": "Your Name" },
  "plugins": [
    {
      "name": "dossier",
      "source": "https://github.com/your-org/dossier",
      "description": "Dossier workflow skills for Claude Code"
    }
  ]
}
```

Use `source` as a git URL or path as per [Plugin sources](https://code.claude.com/docs/en/plugin-marketplaces#plugin-sources). Users then:

```text
/plugin marketplace add <your-marketplace-url-or-path>
/plugin install dossier@your-marketplace
```

---

## 5. Summary

| Question | Answer |
|----------|--------|
| Package Dossier as a Claude Plugin? | Yes: build a **plugin package** (manifest + skills/agents/hooks/MCP) that extends Claude Code. The Dossier Next.js app remains a separate product; the plugin can optionally call it via API/MCP. |
| Dump agentic-flow and use Claude SDK? | Execution **already** uses the Claude SDK. Agentic-flow is only used for the coder agent definition. Removing agentic-flow is optional (ship your own coder agent + loader as in the execution-agent-package-size-reduction proposal); it’s not required for the plugin. |
| List on “their” marketplace? | Use your own marketplace (marketplace.json in a repo) and share the URL, and/or follow Anthropic’s process for the official marketplace if you want to be listed there. |

---

## 6. Decisions / Next Steps

- [ ] Choose plugin location: subfolder in Dossier repo (e.g. `dossier-claude-plugin/`) vs separate repo.
- [ ] Define initial skills (e.g. `plan`, `review`, `build`) and optional agent(s).
- [ ] Optionally implement MCP server that calls Dossier API for “Claude Code ↔ Dossier” integration.
- [ ] Create marketplace (if self-hosting) and add the Dossier plugin entry.
- [ ] (Independent of plugin) Optionally remove agentic-flow from the app by implementing the Dossier coder agent + loader per execution-agent-package-size-reduction-proposal.
