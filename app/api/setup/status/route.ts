/**
 * Returns whether setup is needed (missing API keys).
 * Anthropic is satisfied by API key in env/config or installed Claude CLI.
 */

import { NextResponse } from "next/server";
import { readConfigFile, getConfigPath } from "@/lib/config/data-dir";
import { resolvePlanningCredentialWithSource } from "@/lib/llm/planning-credential";
import { isClaudeCliAvailable } from "@/lib/llm/claude-client";

function hasKey(key: string, config: Record<string, string>): boolean {
  return !!(process.env[key]?.trim() || config[key]?.trim());
}

export async function GET() {
  const config = readConfigFile();
  const missing: string[] = [];
  const resolved = resolvePlanningCredentialWithSource();
  const anthropicSatisfied = !!resolved || isClaudeCliAvailable();
  if (!anthropicSatisfied) missing.push("ANTHROPIC_API_KEY");
  if (!hasKey("GITHUB_TOKEN", config)) missing.push("GITHUB_TOKEN");
  const cliDetected = resolved?.source === "cli" || (!resolved && isClaudeCliAvailable());
  return NextResponse.json({
    needsSetup: missing.length > 0,
    missingKeys: missing,
    configPath: getConfigPath(),
    anthropicViaCli: cliDetected,
  });
}
