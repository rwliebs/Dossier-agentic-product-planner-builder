/**
 * Resolves the Anthropic credential to use for planning (chat/stream).
 * Used by claude-client to support both API key and OAuth/Max (Issue #10).
 *
 * For local Max usage: also reads from ~/.claude/settings.json (Claude Code user scope)
 * when env.env.ANTHROPIC_AUTH_TOKEN is set there. See code.claude.com/docs/en/settings
 * and code.claude.com/docs/en/env-vars (ANTHROPIC_AUTH_TOKEN).
 *
 * When returning an OAuth token we set process.env.CLAUDE_CODE_OAUTH_TOKEN so
 * @anthropic-ai/claude-agent-sdk sees it (per issue #10 ref: anthropics/claude-agent-sdk-python#559).
 */

import * as fs from "fs";
import * as path from "path";
import { readConfigFile } from "@/lib/config/data-dir";

/** Claude Code user settings path (code.claude.com: "User settings are defined in ~/.claude/settings.json"). Respects CLAUDE_CONFIG_DIR. */
function getClaudeCodeUserSettingsPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".claude");
  return path.join(configDir, "settings.json");
}

/**
 * Reads ANTHROPIC_AUTH_TOKEN from Claude Code user settings if present.
 * settings.json may contain {"env": {"ANTHROPIC_AUTH_TOKEN": "sk-ant-oat01-..."}}.
 * Returns null if file missing, invalid JSON, or key not set.
 */
function readTokenFromClaudeCodeSettings(): string | null {
  const settingsPath = getClaudeCodeUserSettingsPath();
  if (!fs.existsSync(settingsPath)) return null;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { env?: Record<string, string> };
    const token = parsed?.env?.ANTHROPIC_AUTH_TOKEN?.trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Returns the credential for planning LLM: API key or OAuth token.
 * Prefers ANTHROPIC_API_KEY when set; otherwise ANTHROPIC_AUTH_TOKEN (OAuth/Max).
 * Checks: process.env → ~/.dossier/config → ~/.claude/settings.json (Claude Code local Max).
 * When the token is used for the Agent SDK we also set CLAUDE_CODE_OAUTH_TOKEN (SDK expects this name).
 * Returns null when neither is set.
 */
export function resolvePlanningCredential(): string | null {
  const fromEnvKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnvKey) return fromEnvKey;

  const config = readConfigFile();
  const fromConfigKey = config.ANTHROPIC_API_KEY?.trim();
  if (fromConfigKey) {
    process.env.ANTHROPIC_API_KEY = fromConfigKey;
    return fromConfigKey;
  }

  const fromEnvToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (fromEnvToken) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = fromEnvToken;
    return fromEnvToken;
  }

  const fromConfigToken = config.ANTHROPIC_AUTH_TOKEN?.trim();
  if (fromConfigToken) {
    process.env.ANTHROPIC_AUTH_TOKEN = fromConfigToken;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = fromConfigToken;
    return fromConfigToken;
  }

  const fromClaudeCodeSettings = readTokenFromClaudeCodeSettings();
  if (fromClaudeCodeSettings) {
    process.env.ANTHROPIC_AUTH_TOKEN = fromClaudeCodeSettings;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = fromClaudeCodeSettings;
    return fromClaudeCodeSettings;
  }

  return null;
}
