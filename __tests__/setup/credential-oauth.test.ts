/**
 * TDD: OAuth/Max credential support for setup and status.
 * Issue #10 — ANTHROPIC_AUTH_TOKEN must satisfy Anthropic credential requirement.
 *
 * These tests fail until setup/status/middleware accept ANTHROPIC_AUTH_TOKEN.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/config/data-dir", () => ({
  readConfigFile: vi.fn(() => ({})),
  getConfigPath: vi.fn(() => "/tmp/.dossier/config"),
  writeConfigFile: vi.fn(),
  getDataDir: vi.fn(() => "/tmp/.dossier"),
  ensureDataDir: vi.fn(() => "/tmp/.dossier"),
  getSqlitePath: vi.fn(() => "/tmp/.dossier/dossier.db"),
}));

import { GET } from "@/app/api/setup/status/route";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "GITHUB_TOKEN",
] as const;

function saveEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    out[k] = process.env[k];
  }
  return out;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (saved[k] !== undefined) {
      process.env[k] = saved[k];
    } else {
      delete process.env[k];
    }
  }
}

describe("setup credential OAuth (Issue #10)", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it("GET /api/setup/status returns needsSetup: false when only ANTHROPIC_AUTH_TOKEN and GITHUB_TOKEN are set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = "oauth-token-for-max";
    process.env.GITHUB_TOKEN = "gh-token";

    const res = await GET();
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.needsSetup).toBe(false);
    expect(Array.isArray(data.missingKeys) ? data.missingKeys : []).not.toContain(
      "ANTHROPIC_API_KEY"
    );
  });

  it("POST /api/setup accepts anthropicAuthToken only and returns success", async () => {
    const { POST: setupPost } = await import("@/app/api/setup/route");
    const req = new Request("http://localhost/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anthropicAuthToken: "saved-oauth-token",
        anthropicApiKey: "",
        githubToken: "",
      }),
    });

    const res = await setupPost(req as unknown as import("next/server").NextRequest);
    const body = await res.json();

    // Current route requires at least one of anthropicApiKey or githubToken; anthropicAuthToken not accepted yet.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
