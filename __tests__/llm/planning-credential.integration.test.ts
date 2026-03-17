/**
 * Integration test: resolvePlanningCredential() with a real filesystem.
 * No fs mocks. Creates a temp dir, writes ~/.claude/settings.json (via CLAUDE_CONFIG_DIR),
 * and asserts we read the credential from it.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/config/data-dir", () => ({
  readConfigFile: vi.fn(() => ({})),
  getConfigPath: vi.fn(() => "/tmp/.dossier/config"),
  writeConfigFile: vi.fn(),
  getDataDir: vi.fn(() => "/tmp/.dossier"),
  ensureDataDir: vi.fn(() => "/tmp/.dossier"),
  getSqlitePath: vi.fn(() => "/tmp/.dossier/dossier.db"),
}));

import { resolvePlanningCredential } from "@/lib/llm/planning-credential";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR"] as const;

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

describe("resolvePlanningCredential (integration: real filesystem)", () => {
  let tmpDir: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dossier-claude-cli-"));
  });

  afterEach(() => {
    restoreEnv(savedEnv);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("reads API key from real settings.json when no env or dossier config", () => {
    const apiKey = "sk-ant-integration-test-api-key";
    const settingsPath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ env: { ANTHROPIC_API_KEY: apiKey } }, null, 2),
      "utf-8",
    );

    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const result = resolvePlanningCredential();

    expect(result).toBe(apiKey);
    expect(process.env.ANTHROPIC_API_KEY).toBe(apiKey);
  });

  it("reads token from real settings.json and sets CLAUDE_CODE_OAUTH_TOKEN", () => {
    const token = "sk-ant-oat01-integration-test-token";
    const settingsPath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: token } }, null, 2),
      "utf-8",
    );

    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const result = resolvePlanningCredential();

    expect(result).toBe(token);
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(token);
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe(token);
  });

  it("returns null when settings.json does not exist in CLAUDE_CONFIG_DIR", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;
    // no settings.json created

    const result = resolvePlanningCredential();

    expect(result).toBeNull();
  });

  it("prefers env over real Claude CLI settings file", () => {
    const envKey = "sk-ant-env-key";
    const cliKey = "sk-ant-cli-key";
    const settingsPath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ env: { ANTHROPIC_API_KEY: cliKey } }, null, 2),
      "utf-8",
    );

    process.env.ANTHROPIC_API_KEY = envKey;
    process.env.CLAUDE_CONFIG_DIR = tmpDir;

    const result = resolvePlanningCredential();

    expect(result).toBe(envKey);
  });
});
