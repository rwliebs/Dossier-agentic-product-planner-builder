import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  authorizeUrl,
  codeChallengeS256,
  generateCodeVerifier,
  mergeReturnPathQuery,
  normalizeReturnTo,
  oauthCallbackUrlFromRequest,
  parseHostHeader,
} from "@/lib/github/oauth-server";

describe("oauth-server", () => {
  it("normalizeReturnTo accepts same-origin paths only", () => {
    expect(normalizeReturnTo("/setup")).toBe("/setup");
    expect(normalizeReturnTo("/a/b?x=1")).toBe("/a/b?x=1");
    expect(normalizeReturnTo(null)).toBeNull();
    expect(normalizeReturnTo("//evil")).toBeNull();
    expect(normalizeReturnTo("https://evil.com")).toBeNull();
    expect(normalizeReturnTo("\\foo")).toBeNull();
  });

  it("mergeReturnPathQuery merges query into path", () => {
    expect(mergeReturnPathQuery("/setup", { github_oauth: "success" })).toBe("/setup?github_oauth=success");
    expect(mergeReturnPathQuery("/", { a: "1" })).toBe("/?a=1");
  });

  it("parseHostHeader parses IPv4 and bracketed IPv6", () => {
    expect(parseHostHeader("127.0.0.1:3000")).toEqual({ hostname: "127.0.0.1", port: 3000 });
    expect(parseHostHeader("localhost")).toEqual({ hostname: "localhost", port: null });
    expect(parseHostHeader("[::1]:8080")).toEqual({ hostname: "::1", port: 8080 });
  });

  it("oauthCallbackUrlFromRequest uses 127.0.0.1 and port on loopback", () => {
    const req = new NextRequest("http://localhost:3000/api/github/oauth/start", {
      headers: { host: "localhost:3000" },
    });
    expect(oauthCallbackUrlFromRequest(req)).toBe("http://127.0.0.1:3000/api/github/oauth/callback");
  });

  it("oauthCallbackUrlFromRequest honors port query on loopback start URL", () => {
    const req = new NextRequest("http://127.0.0.1:3000/api/github/oauth/start?port=4000", {
      headers: { host: "127.0.0.1:3000" },
    });
    expect(oauthCallbackUrlFromRequest(req)).toBe("http://127.0.0.1:4000/api/github/oauth/callback");
  });

  it("oauthCallbackUrlFromRequest uses origin when not loopback", () => {
    const req = new NextRequest("https://example.com/api/github/oauth/start", {
      headers: { host: "example.com" },
    });
    expect(oauthCallbackUrlFromRequest(req)).toBe("https://example.com/api/github/oauth/callback");
  });

  it("authorizeUrl includes PKCE parameters", () => {
    const verifier = generateCodeVerifier();
    const challenge = codeChallengeS256(verifier);
    const url = authorizeUrl({
      clientId: "cid",
      redirectUri: "http://127.0.0.1:3000/api/github/oauth/callback",
      state: "st",
      codeChallenge: challenge,
    });
    expect(url).toContain("code_challenge=");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=st");
  });
});
