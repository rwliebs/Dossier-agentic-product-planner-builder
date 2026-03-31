import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/config/data-dir", () => ({
  readConfigFile: vi.fn(() => ({})),
}));

import { readConfigFile } from "@/lib/config/data-dir";
import { resolveGitHubToken } from "@/lib/github/resolve-github-token";

describe("resolveGitHubToken", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(readConfigFile).mockReturnValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns env token when set and ignore flag absent", () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-env");
    expect(resolveGitHubToken()).toBe("gh-env");
  });

  it("returns null when ignore flag set and only env has token", () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-env");
    vi.mocked(readConfigFile).mockReturnValue({ DOSSIER_GITHUB_IGNORE_ENV: "1" });
    expect(resolveGitHubToken()).toBeNull();
  });

  it("returns config token when ignore flag set (OAuth reconnect to file)", () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-env");
    vi.mocked(readConfigFile).mockReturnValue({
      DOSSIER_GITHUB_IGNORE_ENV: "true",
      GITHUB_TOKEN: "gh-config",
    });
    expect(resolveGitHubToken()).toBe("gh-config");
  });

  it("returns config token when no env token", () => {
    vi.mocked(readConfigFile).mockReturnValue({ GITHUB_TOKEN: "from-file" });
    expect(resolveGitHubToken()).toBe("from-file");
  });
});
