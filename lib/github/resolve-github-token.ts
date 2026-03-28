/**
 * Single source for GitHub API / HTTPS git bearer token (PAT or OAuth user token).
 *
 * If the user disconnects in the UI while GITHUB_TOKEN is still set in the environment
 * (e.g. .env.local), we persist DOSSIER_GITHUB_IGNORE_ENV in ~/.dossier/config so the
 * app behaves as disconnected until they Connect / save a PAT again.
 */

import { readConfigFile } from "@/lib/config/data-dir";

/** When "1"/"true"/"yes" in config, process.env.GITHUB_TOKEN is not used. */
export const DOSSIER_GITHUB_IGNORE_ENV_KEY = "DOSSIER_GITHUB_IGNORE_ENV";

function ignoreEnvToken(config: Record<string, string>): boolean {
  const v = config[DOSSIER_GITHUB_IGNORE_ENV_KEY]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveGitHubToken(): string | null {
  const config = readConfigFile();
  if (!ignoreEnvToken(config)) {
    const fromEnv = process.env.GITHUB_TOKEN?.trim();
    if (fromEnv) return fromEnv;
  }
  const fromConfig = config.GITHUB_TOKEN?.trim();
  return fromConfig ?? null;
}
