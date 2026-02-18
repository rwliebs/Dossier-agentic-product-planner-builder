/**
 * Returns whether setup is needed (missing API keys).
 * Does not expose actual key values.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    missing.push("ANTHROPIC_API_KEY");
  }
  if (!process.env.GITHUB_TOKEN?.trim()) {
    missing.push("GITHUB_TOKEN");
  }
  return NextResponse.json({
    needsSetup: missing.length > 0,
    missingKeys: missing,
  });
}
