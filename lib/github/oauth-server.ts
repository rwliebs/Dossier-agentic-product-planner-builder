/**
 * GitHub OAuth (PKCE) helpers — no I/O except crypto.
 */

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

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

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(h)) return true;
  return h.startsWith("[::1]");
}

/** Parse Host / X-Forwarded-Host value into hostname and port (if present). */
export function parseHostHeader(hostHeader: string): { hostname: string; port: number | null } {
  const trimmed = hostHeader.trim().split(",")[0]?.trim() ?? "";
  if (!trimmed) return { hostname: "", port: null };
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end === -1) return { hostname: trimmed, port: null };
    const hostname = trimmed.slice(1, end);
    const rest = trimmed.slice(end + 1);
    if (rest.startsWith(":")) {
      const p = Number.parseInt(rest.slice(1), 10);
      return { hostname, port: Number.isFinite(p) && p >= 1 && p <= 65535 ? p : null };
    }
    return { hostname, port: null };
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon === -1) return { hostname: trimmed, port: null };
  const maybePort = trimmed.slice(colon + 1);
  if (!/^\d+$/.test(maybePort)) return { hostname: trimmed, port: null };
  const p = Number.parseInt(maybePort, 10);
  return {
    hostname: trimmed.slice(0, colon),
    port: Number.isFinite(p) && p >= 1 && p <= 65535 ? p : null,
  };
}

/**
 * redirect_uri for GitHub: loopback uses 127.0.0.1 with dynamic port per GitHub docs.
 * Optional `port` on the **start** request overrides when the host is loopback (Electron).
 */
export function oauthCallbackUrlFromRequest(request: NextRequest): string {
  const url = request.nextUrl;
  const hostHeader = request.headers.get("host") ?? "";
  const { hostname, port: hostPort } = parseHostHeader(hostHeader);
  const loopback = isLoopbackHostname(hostname);

  let port = hostPort;
  const portParam = url.searchParams.get("port");
  if (loopback && portParam && /^\d{1,5}$/.test(portParam)) {
    const p = Number.parseInt(portParam, 10);
    if (p >= 1 && p <= 65535) port = p;
  }

  if (loopback) {
    const p = port ?? 3000;
    return `http://127.0.0.1:${p}${GITHUB_OAUTH_CALLBACK_PATH}`;
  }

  return `${url.origin}${GITHUB_OAUTH_CALLBACK_PATH}`;
}

/** Append query pairs to a same-origin path (must start with /). */
export function mergeReturnPathQuery(returnPath: string, extra: Record<string, string>): string {
  const pathOnly = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
  const u = new URL(`http://internal.invalid${pathOnly}`);
  for (const [k, v] of Object.entries(extra)) {
    u.searchParams.set(k, v);
  }
  return `${u.pathname}${u.search}`;
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
