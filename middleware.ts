import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolvePlanningCredential } from "@/lib/llm/planning-credential";
import { isClaudeCliAvailable } from "@/lib/llm/claude-client";
import { resolveGitHubToken } from "@/lib/github/resolve-github-token";

export const config = {
  runtime: "nodejs",
};

const SETUP_PATH = "/setup";

function needsSetup(): boolean {
  const credential = resolvePlanningCredential();
  const hasAnthropic = Boolean(credential) || (!credential && isClaudeCliAvailable());
  const hasGithub = Boolean(resolveGitHubToken());
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
