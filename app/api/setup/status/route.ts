/**
 * Returns whether setup is needed (missing API keys).
 * Anthropic is satisfied by API key in env/config or installed Claude CLI.
 */

import { NextResponse } from "next/server";
import { getConfigPath } from "@/lib/config/data-dir";
import { resolvePlanningCredentialWithSource } from "@/lib/llm/planning-credential";
import { isClaudeCliAvailable } from "@/lib/llm/claude-client";
import { resolveGitHubToken } from "@/lib/github/resolve-github-token";

export async function GET() {
  const missing: string[] = [];
  const resolved = resolvePlanningCredentialWithSource();
  const cliAvailable = !resolved && isClaudeCliAvailable();
  const anthropicSatisfied = !!resolved || cliAvailable;
  if (!anthropicSatisfied) missing.push("ANTHROPIC_API_KEY");
  if (!resolveGitHubToken()) missing.push("GITHUB_TOKEN");
  const cliDetected = resolved?.source === "cli" || cliAvailable;
  return NextResponse.json({
    needsSetup: missing.length > 0,
    missingKeys: missing,
    configPath: getConfigPath(),
    anthropicViaCli: cliDetected,
  });
}
