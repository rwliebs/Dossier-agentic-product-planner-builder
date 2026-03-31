import { NextRequest, NextResponse } from "next/server";
import {
  authorizeUrl,
  COOKIE_RETURN,
  COOKIE_STATE,
  COOKIE_VERIFIER,
  codeChallengeS256,
  generateCodeVerifier,
  generateOAuthState,
  githubOAuthClientId,
  normalizeReturnTo,
  oauthCallbackUrlFromRequest,
} from "@/lib/github/oauth-server";

const COOKIE_MAX_AGE = 600;

function oauthCookieOptions(request: NextRequest) {
  const secure = request.nextUrl.protocol === "https:";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

/** GET /api/github/oauth/start — PKCE + state cookies, redirect to GitHub */
export async function GET(request: NextRequest) {
  const clientId = githubOAuthClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_OAUTH_CLIENT_ID is not configured." },
      { status: 503 }
    );
  }

  const url = request.nextUrl;
  const returnTo = normalizeReturnTo(url.searchParams.get("return_to")) ?? "/";

  const redirectUri = oauthCallbackUrlFromRequest(request);
  const state = generateOAuthState();
  const verifier = generateCodeVerifier();
  const challenge = codeChallengeS256(verifier);

  const gh = authorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  const res = NextResponse.redirect(gh);
  const base = oauthCookieOptions(request);
  res.cookies.set(COOKIE_STATE, state, base);
  res.cookies.set(COOKIE_VERIFIER, verifier, base);
  res.cookies.set(COOKIE_RETURN, returnTo, base);
  return res;
}
