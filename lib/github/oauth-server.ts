/**
 * GitHub OAuth (PKCE) helpers — no I/O except crypto.
 */

import { createHash, randomBytes } from "node:crypto";

export const GITHUB_OAUTH_CALLBACK_PATH = "/api/github/oauth/callback";
export const GITHUB_OAUTH_SCOPE = "repo";

const RETURN_TO_MAX = 512;

/** Cookie names for the authorization-code flow */
export const COOKIE_STATE = "dossier_gh_oauth_state";
export const COOKIE_VERIFIER = "dossier_gh_oauth_verifier";
export const COOKIE_RETURN = "dossier_gh_oauth_return";

export function githubOAuthClientId(): string | undefined {
  return process.env.GITHUB_OAUTH_CLIENT_ID?.trim() || undefined;
}

export function githubOAuthClientSecret(): string | undefined {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || undefined;
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Same-origin path only: must start with /, not //, no scheme or host.
 */
export function normalizeReturnTo(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const s = raw.trim();
  if (s.length > RETURN_TO_MAX) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  if (s.includes("\\")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return null;
  return s;
}

export function buildCallbackUrl(requestUrl: string): string {
  const u = new URL(requestUrl);
  u.pathname = GITHUB_OAUTH_CALLBACK_PATH;
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function authorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("scope", GITHUB_OAUTH_SCOPE);
  u.searchParams.set("state", params.state);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("allow_signup", "true");
  return u.toString();
}
