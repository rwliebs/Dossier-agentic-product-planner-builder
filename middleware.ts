import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SETUP_PATH = "/setup";

function needsSetup(): boolean {
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  const github = process.env.GITHUB_TOKEN?.trim();
  return !anthropic || !github;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never redirect API, static, or setup
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
