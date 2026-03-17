/**
 * Saves API keys to ~/.dossier/config.
 * Merges with existing file; preserves other vars and comments.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeConfigFile, getConfigPath } from "@/lib/config/data-dir";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const anthropicApiKey = typeof body.anthropicApiKey === "string" ? body.anthropicApiKey.trim() : "";
    const githubToken = typeof body.githubToken === "string" ? body.githubToken.trim() : "";

    if (!anthropicApiKey && !githubToken) {
      return NextResponse.json(
        { success: false, error: "At least one key is required" },
        { status: 400 }
      );
    }

    const updates: Record<string, string> = {};
    if (anthropicApiKey) updates.ANTHROPIC_API_KEY = anthropicApiKey;
    if (githubToken) updates.GITHUB_TOKEN = githubToken;

    writeConfigFile(updates);

    // Also inject into current process so middleware picks them up without restart
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }

    return NextResponse.json({
      success: true,
      configPath: getConfigPath(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
