/**
 * TDD: Planning credential resolution for Issue #10.
 * When only ANTHROPIC_AUTH_TOKEN is set (OAuth/Max), planning should use it via Agent SDK.
 * Also reads from ~/.claude/settings.json (Claude Code local Max) when no env/config token.
 */

import * as fs from "fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/config/data-dir", () => ({
  readConfigFile: vi.fn(),
  getConfigPath: vi.fn(() => "/tmp/.dossier/config"),
  writeConfigFile: vi.fn(),
  getDataDir: vi.fn(() => "/tmp/.dossier"),
  ensureDataDir: vi.fn(() => "/tmp/.dossier"),
  getSqlitePath: vi.fn(() => "/tmp/.dossier/dossier.db"),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { readConfigFile } from "@/lib/config/data-dir";
import { resolvePlanningCredential } from "@/lib/llm/planning-credential";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN"] as const;

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

describe("resolvePlanningCredential (Issue #10)", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    vi.mocked(readConfigFile).mockReturnValue({});
  });

  afterEach(() => {
    restoreEnv(savedEnv);
    vi.restoreAllMocks();
  });

  it("returns API key when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    expect(resolvePlanningCredential()).toBe("sk-ant-xxx");
  });

  it("returns OAuth token when only ANTHROPIC_AUTH_TOKEN is set (no API key)", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = "oauth-token-for-max";
    expect(resolvePlanningCredential()).toBe("oauth-token-for-max");
  });

  it("prefers API key over OAuth token when both are set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-xxx";
    process.env.ANTHROPIC_AUTH_TOKEN = "oauth-token";
    expect(resolvePlanningCredential()).toBe("sk-ant-xxx");
  });

  it("returns null when neither API key nor OAuth token is set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(resolvePlanningCredential()).toBeNull();
  });

  it("returns token from ~/.claude/settings.json when no env or dossier config (local Max)", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
    const settingsPath = "/tmp/claude-test/settings.json";
    const token = "sk-ant-oat01-from-claude-settings";
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockImplementation((p, enc) => {
      if (p === settingsPath && enc === "utf-8") {
        return JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: token } });
      }
      throw new Error("unexpected read");
    });
    expect(resolvePlanningCredential()).toBe(token);
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(token);
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe(token);
  });
});
