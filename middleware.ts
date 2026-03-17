import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readConfigFile } from "@/lib/config/data-dir";
import { resolvePlanningCredential } from "@/lib/llm/planning-credential";
import { isClaudeCliAvailable } from "@/lib/llm/claude-client";

export const config = {
  runtime: "nodejs",
};

const SETUP_PATH = "/setup";

function needsSetup(): boolean {
  const credential = resolvePlanningCredential();
  const hasAnthropic = Boolean(credential) || (!credential && isClaudeCliAvailable());
  const cfg = readConfigFile();
  const hasGithub = !!(process.env.GITHUB_TOKEN?.trim() || cfg.GITHUB_TOKEN?.trim());
  return !hasAnthropic || !hasGithub;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }
  if (pathname === SETUP_PATH) {
    return NextResponse.next();
  }

  if (needsSetup()) {
    return NextResponse.redirect(new URL(SETUP_PATH, request.url));
  }

  return NextResponse.next();
}
