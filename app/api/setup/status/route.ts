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

export async function GET() {
  const config = readConfigFile();
  const missing: string[] = [];
  if (!hasKey("ANTHROPIC_API_KEY", config)) missing.push("ANTHROPIC_API_KEY");
  if (!hasKey("GITHUB_TOKEN", config)) missing.push("GITHUB_TOKEN");
  return NextResponse.json({
    needsSetup: missing.length > 0,
    missingKeys: missing,
    configPath: getConfigPath(),
  });
}
