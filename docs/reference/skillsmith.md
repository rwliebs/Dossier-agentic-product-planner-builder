# Skillsmith and Planning Skills

## Skillsmith CLI

The project uses the [Skillsmith](https://www.skillsmith.app/) CLI for discovering and installing agent skills. The CLI is installed globally:

```bash
# Verify installation
skillsmith --version

# Search for skills
skillsmith search <query>
skillsmith search react --category development
skillsmith search git --tier verified

# Get recommendations for this project
skillsmith recommend

# Install a skill
skillsmith install <skill-name-or-id>

# List installed skills
skillsmith list

# Show skill details
skillsmith info <skill-name>
```

Skills are installed to `~/.claude/skills/` (or project-local `.claude/skills/`) and are available to MCP-compatible clients (Cursor, Claude Desktop, etc.) when the Skillsmith MCP server is configured.

## Skillsmith MCP (Cursor / Claude Desktop)

To let your AI client discover and use Skillsmith skills via MCP, add the Skillsmith MCP server to your client config.

**Cursor:** add to `.cursor/mcp.json` or your MCP settings:

```json
{
  "mcpServers": {
    "skillsmith": {
      "command": "npx",
      "args": ["-y", "@skillsmith/mcp-server"]
    }
  }
}
```

After adding and restarting, you can ask the assistant to search for and install skills (e.g. "Find testing skills for my project").

See [Skillsmith — Install MCP](https://www.skillsmith.app/#mcp-install-block) for the latest snippet.

## Bundled Planning Skills (Dossier)

Dossier includes **local** planning skills that are injected into the planning agent’s system prompt. These are not installed via Skillsmith; they live in the repo and are always used when building story maps.

| Skill | Purpose |
|-------|--------|
| **Jobs-to-be-Done (JTBD)** | Frames user needs as jobs and outcomes; prefers "job" language over feature-first language. |
| **User Story Mapping** | Enforces backbone → activities → cards ordering and user-journey naming. |

Defined in:

- `lib/llm/skills/jobs-to-be-done.ts`
- `lib/llm/skills/user-story-mapping.ts`
- `lib/llm/skills/index.ts` (`getPlanningSkills()`)

They are wired into:

- `buildPlanningSystemPrompt()` (full planning)
- `buildScaffoldSystemPrompt()` (scaffold mode)
- `buildPopulateWorkflowPrompt()` (populate mode)

To add more local skills, create a new file under `lib/llm/skills/` and append its content in `getPlanningSkills()`.
