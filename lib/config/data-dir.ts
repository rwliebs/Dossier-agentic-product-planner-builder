/**
 * Centralized data directory and config file management.
 *
 * All Dossier user data lives under a single directory (default: ~/.dossier/).
 * Layout:
 *   ~/.dossier/
 *     config        — key=value config file (API keys, feature flags)
 *     dossier.db    — SQLite database
 *     ruvector/     — vector embeddings (future)
 *
 * Override with DOSSIER_DATA_DIR env var.
 */

import * as path from "path";
import * as fs from "fs";

export function getDataDir(): string {
  const env = process.env.DOSSIER_DATA_DIR;
  if (env) return env;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(home, ".dossier");
}

export function ensureDataDir(): string {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(): string {
  return path.join(getDataDir(), "config");
}

export function getSqlitePath(): string {
  return process.env.SQLITE_PATH ?? path.join(ensureDataDir(), "dossier.db");
}

/**
 * Parse the config file into a Record<string, string>.
 * Supports KEY=VALUE, KEY="VALUE", and # comments.
 */
export function readConfigFile(): Record<string, string> {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};

  const content = fs.readFileSync(configPath, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Write/merge key-value pairs into the config file.
 * Preserves existing keys and comments.
 */
export function writeConfigFile(updates: Record<string, string>): void {
  ensureDataDir();
  const configPath = getConfigPath();

  let lines: string[] = [];
  const seen = new Set<string>();

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf-8");
    for (const line of content.split("\n")) {
      let replaced = false;
      for (const [key, value] of Object.entries(updates)) {
        if (line.trim().startsWith(`${key}=`)) {
          lines.push(`${key}=${escapeConfigValue(value)}`);
          seen.add(key);
          replaced = true;
          break;
        }
      }
      if (!replaced) lines.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${escapeConfigValue(value)}`);
  }

  fs.writeFileSync(configPath, lines.join("\n") + (lines.length ? "\n" : ""), {
    mode: 0o600,
  });
}

function escapeConfigValue(v: string): string {
  if (v.includes(" ") || v.includes("#") || v.includes('"')) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * Load config file values into process.env (without overwriting existing vars).
 * Call this early in the CLI entry point so Next.js sees the values.
 */
export function loadConfigIntoEnv(): void {
  const config = readConfigFile();
  for (const [key, value] of Object.entries(config)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
