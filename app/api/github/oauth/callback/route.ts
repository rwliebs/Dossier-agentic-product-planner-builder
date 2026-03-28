import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_RETURN,
  COOKIE_STATE,
  COOKIE_VERIFIER,
  githubOAuthClientId,
  githubOAuthClientSecret,
  mergeReturnPathQuery,
  oauthCallbackUrlFromRequest,
} from "@/lib/github/oauth-server";
import { removeConfigKeys, writeConfigFile } from "@/lib/config/data-dir";
import { DOSSIER_GITHUB_IGNORE_ENV_KEY } from "@/lib/github/resolve-github-token";

function clearOAuthCookies(res: NextResponse, request: NextRequest) {
  const secure = request.nextUrl.protocol === "https:";
  const opts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 0 };
  res.cookies.set(COOKIE_STATE, "", opts);
  res.cookies.set(COOKIE_VERIFIER, "", opts);
  res.cookies.set(COOKIE_RETURN, "", opts);
}

function redirectError(request: NextRequest, returnPath: string, code: string): NextResponse {
  const path = mergeReturnPathQuery(returnPath, { github_error: code });
  const res = NextResponse.redirect(new URL(path, request.url));
  clearOAuthCookies(res, request);
  return res;
}

/** GET /api/github/oauth/callback — exchange code, persist GITHUB_TOKEN, redirect */
export async function GET(request: NextRequest) {
  const clientId = githubOAuthClientId();
  if (!clientId) {
    return redirectError(request, "/setup", "misconfigured");
  }

  const url = request.nextUrl;
  const returnCookie = request.cookies.get(COOKIE_RETURN)?.value ?? "/";
  const returnPath = returnCookie.startsWith("/") ? returnCookie : "/";

  const ghError = url.searchParams.get("error");
  if (ghError === "access_denied") {
    return redirectError(request, returnPath, "access_denied");
  }
  if (ghError) {
    return redirectError(request, returnPath, "access_denied");
  }

  const code = url.searchParams.get("code");
  const stateQ = url.searchParams.get("state");
  const stateCookie = request.cookies.get(COOKIE_STATE)?.value;
  const verifier = request.cookies.get(COOKIE_VERIFIER)?.value;

  if (!code || !stateQ || !stateCookie || !verifier || stateQ !== stateCookie) {
    return redirectError(request, returnPath, "invalid_state");
  }

  const redirectUri = oauthCallbackUrlFromRequest(request);
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const secret = githubOAuthClientSecret();
  if (secret) body.set("client_secret", secret);

  let accessToken: string;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("GitHub token exchange failed:", tokenRes.status, tokenJson);
      return redirectError(request, returnPath, "server");
    }
    accessToken = tokenJson.access_token;
  } catch (e) {
    console.error("GitHub token exchange error:", e);
    return redirectError(request, returnPath, "server");
  }

  try {
    removeConfigKeys([DOSSIER_GITHUB_IGNORE_ENV_KEY]);
    writeConfigFile({ GITHUB_TOKEN: accessToken });
  } catch (e) {
    console.error("writeConfigFile GITHUB_TOKEN failed:", e);
    return redirectError(request, returnPath, "server");
  }

  const path = mergeReturnPathQuery(returnPath, { github_oauth: "success" });
  const res = NextResponse.redirect(new URL(path, request.url));
  clearOAuthCookies(res, request);
  return res;
}
