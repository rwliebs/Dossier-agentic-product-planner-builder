/**
 * Returns whether setup is needed (missing API keys).
 * Checks both process.env and ~/.dossier/config.
 * Does not expose actual key values.
 */

import { NextResponse } from "next/server";
import { readConfigFile, getConfigPath } from "@/lib/config/data-dir";

function hasKey(key: string, config: Record<string, string>): boolean {
  return !!(process.env[key]?.trim() || config[key]?.trim());
}

/** Anthropic credential is satisfied by API key or OAuth token (Issue #10). */
function hasAnthropicCredential(config: Record<string, string>): boolean {
  return hasKey("ANTHROPIC_API_KEY", config) || hasKey("ANTHROPIC_AUTH_TOKEN", config);
}

export async function GET() {
  const config = readConfigFile();
  const missing: string[] = [];
  if (!hasAnthropicCredential(config)) missing.push("ANTHROPIC_API_KEY");
  if (!hasKey("GITHUB_TOKEN", config)) missing.push("GITHUB_TOKEN");
  return NextResponse.json({
    needsSetup: missing.length > 0,
    missingKeys: missing,
    configPath: getConfigPath(),
  });
}
