/**
 * Single source for GitHub API / HTTPS git bearer token (PAT or OAuth user token).
 */

import { readConfigFile } from "@/lib/config/data-dir";

export function resolveGitHubToken(): string | null {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const config = readConfigFile();
  const fromConfig = config.GITHUB_TOKEN?.trim();
  return fromConfig ?? null;
}
