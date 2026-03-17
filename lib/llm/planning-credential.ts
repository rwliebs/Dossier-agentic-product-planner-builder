/**
 * Resolves the Anthropic credential for planning (chat/stream).
 * Order: (1) API key from env, (2) API key from ~/.dossier/config,
 * (3) installed Claude CLI config ~/.claude/settings.json (env.ANTHROPIC_API_KEY or env.ANTHROPIC_AUTH_TOKEN).
 * When the credential is a token (from CLI), we set CLAUDE_CODE_OAUTH_TOKEN for the Agent SDK.
 */

import * as fs from "fs";
import * as path from "path";
import { readConfigFile } from "@/lib/config/data-dir";

/** Claude Code user settings path. Respects CLAUDE_CONFIG_DIR. */
function getClaudeCodeUserSettingsPath(): string {
  const configDir =
    process.env.CLAUDE_CONFIG_DIR ??
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".claude");
  return path.join(configDir, "settings.json");
}

interface ClaudeSettingsEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
}

type ClaudeCredential = { value: string; isToken: boolean };

/**
 * Reads credential from installed Claude CLI user settings (~/.claude/settings.json).
 * Prefers env.ANTHROPIC_API_KEY; falls back to env.ANTHROPIC_AUTH_TOKEN.
 * Returns null if file missing, invalid, or neither key set.
 */
function readCredentialFromClaudeCliSettings(): ClaudeCredential | null {
  const settingsPath = getClaudeCodeUserSettingsPath();
  if (!fs.existsSync(settingsPath)) return null;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { env?: ClaudeSettingsEnv };
    const env = parsed?.env;
    if (!env) return null;
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (apiKey) return { value: apiKey, isToken: false };
    const token = env.ANTHROPIC_AUTH_TOKEN?.trim();
    if (token) return { value: token, isToken: true };
    return null;
  } catch {
    return null;
  }
}

export type CredentialSource = "env" | "config" | "cli";

export interface ResolvedCredential {
  value: string;
  source: CredentialSource;
}

/**
 * Returns the credential for planning with its source.
 * Order: env → ~/.dossier/config → ~/.claude/settings.json.
 * When returning a token we set CLAUDE_CODE_OAUTH_TOKEN for the Agent SDK.
 */
export function resolvePlanningCredentialWithSource(): ResolvedCredential | null {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return { value: fromEnv, source: "env" };

  const config = readConfigFile();
  const fromConfig = config.ANTHROPIC_API_KEY?.trim();
  if (fromConfig) {
    process.env.ANTHROPIC_API_KEY = fromConfig;
    return { value: fromConfig, source: "config" };
  }

  const fromClaudeCli = readCredentialFromClaudeCliSettings();
  if (fromClaudeCli) {
    if (fromClaudeCli.isToken) {
      process.env.ANTHROPIC_AUTH_TOKEN = fromClaudeCli.value;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = fromClaudeCli.value;
      return { value: fromClaudeCli.value, source: "cli" };
    }
    process.env.ANTHROPIC_API_KEY = fromClaudeCli.value;
    return { value: fromClaudeCli.value, source: "cli" };
  }

  return null;
}

/**
 * Returns the credential value for planning, or null.
 * Convenience wrapper around resolvePlanningCredentialWithSource().
 */
export function resolvePlanningCredential(): string | null {
  return resolvePlanningCredentialWithSource()?.value ?? null;
}
