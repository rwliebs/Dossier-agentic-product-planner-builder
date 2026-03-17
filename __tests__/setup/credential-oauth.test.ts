/**
 * Setup credential: API key from env, ~/.dossier/config, or installed Claude CLI.
 * Status uses resolvePlanningCredential() so Claude CLI config satisfies Anthropic.
 */

import * as fs from "fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/config/data-dir", () => ({
  readConfigFile: vi.fn(() => ({})),
  getConfigPath: vi.fn(() => "/tmp/.dossier/config"),
  writeConfigFile: vi.fn(),
  getDataDir: vi.fn(() => "/tmp/.dossier"),
  ensureDataDir: vi.fn(() => "/tmp/.dossier"),
  getSqlitePath: vi.fn(() => "/tmp/.dossier/dossier.db"),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

vi.mock("@/lib/llm/claude-client", () => ({
  isClaudeCliAvailable: vi.fn(() => false),
}));

import { GET } from "@/app/api/setup/status/route";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GITHUB_TOKEN", "CLAUDE_CONFIG_DIR"] as const;

function saveEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    out[k] = process.env[k];
  }
  return out;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (saved[k] !== undefined) process.env[k] = saved[k];
    else delete process.env[k];
  }
}

describe("setup credential (API key only)", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it("GET /api/setup/status returns needsSetup: false when ANTHROPIC_API_KEY and GITHUB_TOKEN are set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
    process.env.GITHUB_TOKEN = "gh-token";
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const res = await GET();
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.needsSetup).toBe(false);
  });

  it("GET /api/setup/status returns needsSetup: true when no API key in env or config and no Claude CLI key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GITHUB_TOKEN = "gh-token";
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const res = await GET();
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.needsSetup).toBe(true);
    expect(data.missingKeys).toContain("ANTHROPIC_API_KEY");
  });

  it("GET /api/setup/status returns needsSetup: false and anthropicViaCli: true when only Claude CLI has API key (no env/config)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GITHUB_TOKEN = "gh-token";
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-status-test";
    const settingsPath = "/tmp/claude-status-test/settings.json";
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockImplementation((p, enc) => {
      if (p === settingsPath && enc === "utf-8") {
        return JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-ant-from-cli" } });
      }
      throw new Error("unexpected read");
    });

    const res = await GET();
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.needsSetup).toBe(false);
    expect(data.missingKeys).not.toContain("ANTHROPIC_API_KEY");
    expect(data.anthropicViaCli).toBe(true);
  });

  it("GET /api/setup/status returns anthropicViaCli: false when API key is in env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
    process.env.GITHUB_TOKEN = "gh-token";

    const res = await GET();
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.needsSetup).toBe(false);
    expect(data.anthropicViaCli).toBe(false);
  });
});
