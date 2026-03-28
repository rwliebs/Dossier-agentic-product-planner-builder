import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/config/data-dir", () => ({
  writeConfigFile: vi.fn(),
  removeConfigKeys: vi.fn(),
}));

vi.mock("@/lib/github/resolve-github-token", () => ({
  resolveGitHubToken: vi.fn(),
  DOSSIER_GITHUB_IGNORE_ENV_KEY: "DOSSIER_GITHUB_IGNORE_ENV",
}));

describe("GitHub OAuth API routes", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test_oauth_client");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("GET /api/github/oauth/start returns 503 when client id missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "");
    const { GET } = await import("@/app/api/github/oauth/start/route");
    const req = new NextRequest("http://127.0.0.1:3000/api/github/oauth/start", {
      headers: { host: "127.0.0.1:3000" },
    });
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/CLIENT_ID/i);
  });

  it("GET /api/github/oauth/start redirects to GitHub", async () => {
    const { GET } = await import("@/app/api/github/oauth/start/route");
    const req = new NextRequest("http://127.0.0.1:3000/api/github/oauth/start?return_to=%2Fsetup", {
      headers: { host: "127.0.0.1:3000" },
    });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    const loc = res.headers.get("location");
    expect(loc).toContain("https://github.com/login/oauth/authorize");
    expect(loc).toContain("client_id=test_oauth_client");
    expect(loc).toContain("code_challenge=");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/dossier_gh_oauth_state=/);
    expect(setCookie).toMatch(/dossier_gh_oauth_verifier=/);
  });

  it("GET /api/github/oauth/callback exchanges code and writes token", async () => {
    const { writeConfigFile, removeConfigKeys } = await import("@/lib/config/data-dir");
    const state = "test-state-val";
    const verifier = "test-verifier-val";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("github.com/login/oauth/access_token")) {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ access_token: "gho_from_oauth", token_type: "bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch: ${u}`);
      })
    );

    const { GET } = await import("@/app/api/github/oauth/callback/route");
    const req = new NextRequest(
      `http://127.0.0.1:3000/api/github/oauth/callback?code=exch-code&state=${encodeURIComponent(state)}`,
      {
        headers: {
          host: "127.0.0.1:3000",
          cookie: `dossier_gh_oauth_state=${state}; dossier_gh_oauth_verifier=${encodeURIComponent(verifier)}; dossier_gh_oauth_return=%2F`,
        },
      }
    );
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("github_oauth=success");
    expect(removeConfigKeys).toHaveBeenCalledWith(["DOSSIER_GITHUB_IGNORE_ENV"]);
    expect(writeConfigFile).toHaveBeenCalledWith({ GITHUB_TOKEN: "gho_from_oauth" });
    vi.unstubAllGlobals();
  });

  it("GET /api/github/oauth/callback rejects bad state", async () => {
    const { GET } = await import("@/app/api/github/oauth/callback/route");
    const req = new NextRequest("http://127.0.0.1:3000/api/github/oauth/callback?code=x&state=bad", {
      headers: {
        host: "127.0.0.1:3000",
        cookie: "dossier_gh_oauth_state=good; dossier_gh_oauth_verifier=v; dossier_gh_oauth_return=%2F",
      },
    });
    const res = await GET(req);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("github_error=invalid_state");
  });

  it("GET /api/github/oauth/meta is true when client id is set", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/github/oauth/meta/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.oauthConfigured).toBe(true);
  });

  it("GET /api/github/oauth/meta is false when client id is missing", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "");
    const { GET } = await import("@/app/api/github/oauth/meta/route");
    const res = await GET();
    const body = await res.json();
    expect(body.oauthConfigured).toBe(false);
  });

  it("DELETE /api/github/auth clears token and ignores env until reconnect", async () => {
    const { removeConfigKeys, writeConfigFile } = await import("@/lib/config/data-dir");
    vi.stubEnv("GITHUB_TOKEN", "env-token");
    const { DELETE } = await import("@/app/api/github/auth/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(removeConfigKeys).toHaveBeenCalledWith(["GITHUB_TOKEN"]);
    expect(writeConfigFile).toHaveBeenCalledWith({ DOSSIER_GITHUB_IGNORE_ENV: "1" });
    vi.unstubAllEnvs();
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test_oauth_client");
  });

  it("GET /api/github/user returns login when token resolves", async () => {
    const { resolveGitHubToken } = await import("@/lib/github/resolve-github-token");
    vi.mocked(resolveGitHubToken).mockReturnValue("gho_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ login: "octocat" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const { GET } = await import("@/app/api/github/user/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.login).toBe("octocat");
  });

  it("GET /api/github/user returns 503 when no token", async () => {
    const { resolveGitHubToken } = await import("@/lib/github/resolve-github-token");
    vi.mocked(resolveGitHubToken).mockReturnValue(null);
    vi.resetModules();
    const { GET } = await import("@/app/api/github/user/route");
    const res = await GET();
    expect(res.status).toBe(503);
  });
});
