/**
 * Planning credential resolution: API key preferred; fallback to installed Claude CLI config.
 * Order: (1) env ANTHROPIC_API_KEY, (2) ~/.dossier/config ANTHROPIC_API_KEY,
 * (3) ~/.claude/settings.json env.ANTHROPIC_API_KEY or env.ANTHROPIC_AUTH_TOKEN.
 */

import * as fs from "fs";
import * as path from "path";
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
import { resolvePlanningCredential, resolvePlanningCredentialWithSource } from "@/lib/llm/planning-credential";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CONFIG_DIR",
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
    if (saved[k] !== undefined) process.env[k] = saved[k];
    else delete process.env[k];
  }
}

describe("resolvePlanningCredential", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    vi.mocked(readConfigFile).mockReturnValue({});
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    restoreEnv(savedEnv);
    vi.restoreAllMocks();
  });

  it("uses API key from env first", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";
    expect(resolvePlanningCredential()).toBe("sk-ant-env");
  });

  it("uses API key from ~/.dossier/config when not in env", () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(readConfigFile).mockReturnValue({ ANTHROPIC_API_KEY: "sk-ant-config" });
    expect(resolvePlanningCredential()).toBe("sk-ant-config");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-config");
  });

  it("prefers env over config", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";
    vi.mocked(readConfigFile).mockReturnValue({ ANTHROPIC_API_KEY: "sk-ant-config" });
    expect(resolvePlanningCredential()).toBe("sk-ant-env");
  });

  it("prefers config over Claude CLI settings", () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(readConfigFile).mockReturnValue({ ANTHROPIC_API_KEY: "sk-ant-config" });
    const settingsPath = "/tmp/.claude/settings.json";
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-ant-cli" } }),
    );
    expect(resolvePlanningCredential()).toBe("sk-ant-config");
  });

  it("uses API key from installed Claude CLI settings when no env or dossier config", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
    const settingsPath = "/tmp/claude-test/settings.json";
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockImplementation((p, enc) => {
      if (p === settingsPath && enc === "utf-8") {
        return JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-ant-from-cli" } });
      }
      throw new Error("unexpected read");
    });
    expect(resolvePlanningCredential()).toBe("sk-ant-from-cli");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-from-cli");
  });

  it("uses token from Claude CLI settings when no API key anywhere and sets CLAUDE_CODE_OAUTH_TOKEN", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
    const settingsPath = "/tmp/claude-test/settings.json";
    const token = "sk-ant-oat01-from-cli";
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockImplementation((p, enc) => {
      if (p === settingsPath && enc === "utf-8") {
        return JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: token } });
      }
      throw new Error("unexpected read");
    });
    const out = resolvePlanningCredential();
    expect(out).toBe(token);
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(token);
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe(token);
  });

  it("prefers API key over token in same Claude CLI settings", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const settingsPath = path.join(process.env.HOME ?? ".", ".claude", "settings.json");
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        env: {
          ANTHROPIC_API_KEY: "sk-ant-key-in-cli",
          ANTHROPIC_AUTH_TOKEN: "sk-ant-oat01-token-in-cli",
        },
      }),
    );
    expect(resolvePlanningCredential()).toBe("sk-ant-key-in-cli");
  });

  it("returns null when no credential in env, config, or Claude CLI", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolvePlanningCredential()).toBeNull();
  });

  it("returns null when Claude CLI settings file is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(resolvePlanningCredential()).toBeNull();
  });

  it("returns null when Claude CLI settings has invalid JSON", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const settingsPath = path.join(process.env.HOME ?? ".", ".claude", "settings.json");
    vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
    vi.mocked(fs.readFileSync).mockReturnValue("not json");
    expect(resolvePlanningCredential()).toBeNull();
  });

  describe("resolvePlanningCredentialWithSource", () => {
    it("returns source 'env' when ANTHROPIC_API_KEY is in env", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-env";
      const result = resolvePlanningCredentialWithSource();
      expect(result).toEqual({ value: "sk-ant-env", source: "env" });
    });

    it("returns source 'config' when key comes from dossier config", () => {
      delete process.env.ANTHROPIC_API_KEY;
      vi.mocked(readConfigFile).mockReturnValue({ ANTHROPIC_API_KEY: "sk-ant-config" });
      const result = resolvePlanningCredentialWithSource();
      expect(result).toEqual({ value: "sk-ant-config", source: "config" });
    });

    it("returns source 'cli' when key comes from Claude CLI settings", () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
      const settingsPath = "/tmp/claude-test/settings.json";
      vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
      vi.mocked(fs.readFileSync).mockImplementation((p, enc) => {
        if (p === settingsPath && enc === "utf-8") {
          return JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-ant-from-cli" } });
        }
        throw new Error("unexpected read");
      });
      const result = resolvePlanningCredentialWithSource();
      expect(result).toEqual({ value: "sk-ant-from-cli", source: "cli" });
    });

    it("returns source 'cli' for token from Claude CLI settings", () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_AUTH_TOKEN;
      process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-test";
      const settingsPath = "/tmp/claude-test/settings.json";
      vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
      vi.mocked(fs.readFileSync).mockImplementation((p, enc) => {
        if (p === settingsPath && enc === "utf-8") {
          return JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: "sk-ant-oat01-tok" } });
        }
        throw new Error("unexpected read");
      });
      const result = resolvePlanningCredentialWithSource();
      expect(result).toEqual({ value: "sk-ant-oat01-tok", source: "cli" });
    });

    it("returns null when no credential found anywhere", () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(resolvePlanningCredentialWithSource()).toBeNull();
    });
  });
});
