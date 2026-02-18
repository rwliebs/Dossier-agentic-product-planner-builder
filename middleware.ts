import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readConfigFile } from "@/lib/config/data-dir";

export const config = {
  runtime: "nodejs",
};

const SETUP_PATH = "/setup";

function needsSetup(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim() && process.env.GITHUB_TOKEN?.trim()) {
    return false;
  }
  const cfg = readConfigFile();
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY?.trim() || cfg.ANTHROPIC_API_KEY?.trim());
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
