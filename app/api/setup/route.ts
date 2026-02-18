/**
 * Saves API keys to .env.local.
 * Merges with existing file; preserves other vars and comments.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

function escapeValue(v: string): string {
  if (v.includes(" ") || v.includes("#") || v.includes('"')) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

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

    const projectRoot = process.cwd();
    const envPath = join(projectRoot, ".env.local");

    const updates: Record<string, string> = {};
    if (anthropicApiKey) updates.ANTHROPIC_API_KEY = anthropicApiKey;
    if (githubToken) updates.GITHUB_TOKEN = githubToken;

    let lines: string[] = [];
    const seen = new Set<string>();

    if (existsSync(envPath)) {
      const content = await readFile(envPath, "utf-8");
      for (const line of content.split("\n")) {
        let replaced = false;
        for (const [key, value] of Object.entries(updates)) {
          if (line.startsWith(`${key}=`)) {
            lines.push(`${key}=${escapeValue(value)}`);
            seen.add(key);
            replaced = true;
            break;
          }
        }
        if (!replaced) lines.push(line);
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      if (!seen.has(key)) lines.push(`${key}=${escapeValue(value)}`);
    }

    await writeFile(envPath, lines.join("\n") + (lines.length ? "\n" : ""), { mode: 0o600 });

    return NextResponse.json({
      success: true,
      message: "Keys saved. Restart the app for changes to take effect.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
