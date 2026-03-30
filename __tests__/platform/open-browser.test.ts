// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execSync: vi.fn() };
});

import { execSync } from "child_process";
import { getBrowserCommands, openBrowser } from "@/lib/platform/open-browser";

const mockExecSync = vi.mocked(execSync);

// ---------------------------------------------------------------------------
// getBrowserCommands
// ---------------------------------------------------------------------------
describe("getBrowserCommands", () => {
  describe("win32", () => {
    it("returns 3 fallback methods", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "win32");
      expect(cmds).toHaveLength(3);
    });

    it("uses rundll32 as first method (most reliable)", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "win32");
      expect(cmds[0].cmd).toContain("rundll32 url.dll,FileProtocolHandler");
    });

    it("uses start as second method", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "win32");
      expect(cmds[1].cmd).toMatch(/^start ""/);
      expect(cmds[1].shell).toBe(true);
    });

    it("uses explorer as third method", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "win32");
      expect(cmds[2].cmd).toContain("explorer");
    });
  });

  describe("darwin", () => {
    it("returns 2 fallback methods", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "darwin");
      expect(cmds).toHaveLength(2);
    });

    it("uses open as first method", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "darwin");
      expect(cmds[0].cmd).toMatch(/^open /);
    });

    it("uses osascript as second method", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "darwin");
      expect(cmds[1].cmd).toContain("osascript");
    });
  });

  describe("linux", () => {
    it("returns 7 fallback methods", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "linux");
      expect(cmds).toHaveLength(7);
    });

    it("tries xdg-open first", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "linux");
      expect(cmds[0].cmd).toMatch(/^xdg-open /);
    });

    it("includes sensible-browser, wslview, and direct browsers", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "linux");
      const all = cmds.map((c) => c.cmd).join(" ");
      expect(all).toContain("sensible-browser");
      expect(all).toContain("wslview");
      expect(all).toContain("google-chrome");
      expect(all).toContain("firefox");
      expect(all).toContain("chromium-browser");
      expect(all).toContain("chromium");
    });
  });

  describe("unknown platforms", () => {
    it("falls back to Linux commands for freebsd", () => {
      const cmds = getBrowserCommands("http://localhost:3000", "freebsd");
      expect(cmds[0].cmd).toMatch(/^xdg-open /);
    });
  });

  describe("URL preservation", () => {
    it("embeds the full URL in every command on every platform", () => {
      const url = "http://localhost:3000/path?key=val&a=b";
      for (const platform of ["win32", "darwin", "linux"] as const) {
        const cmds = getBrowserCommands(url, platform);
        for (const { cmd } of cmds) {
          expect(cmd).toContain(url);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// openBrowser — fallback chain with execSync
// ---------------------------------------------------------------------------
describe("openBrowser", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when the first command succeeds (win32 — rundll32)", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "win32");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledOnce();
    expect(mockExecSync.mock.calls[0][0]).toContain("rundll32");
  });

  it("returns true when the first command succeeds (darwin — open)", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "darwin");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledOnce();
    expect(mockExecSync.mock.calls[0][0]).toMatch(/^open /);
  });

  it("returns true when the first command succeeds (linux — xdg-open)", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "linux");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledOnce();
    expect(mockExecSync.mock.calls[0][0]).toMatch(/^xdg-open /);
  });

  it("falls back when first command throws (win32: rundll32 → start)", () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockReturnValueOnce(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "win32");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledTimes(2);
    expect(mockExecSync.mock.calls[0][0]).toContain("rundll32");
    expect(mockExecSync.mock.calls[1][0]).toMatch(/^start ""/);
  });

  it("falls back through all 3 Windows methods", () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockReturnValueOnce(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "win32");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(mockExecSync.mock.calls[2][0]).toContain("explorer");
  });

  it("falls back on darwin (open → osascript)", () => {
    mockExecSync
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockReturnValueOnce(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "darwin");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledTimes(2);
    expect(mockExecSync.mock.calls[1][0]).toContain("osascript");
  });

  it("walks Linux chain until firefox succeeds", () => {
    // Fail: xdg-open, sensible-browser, wslview, google-chrome → succeed: firefox
    mockExecSync
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockImplementationOnce(() => { throw new Error("fail"); })
      .mockReturnValueOnce(Buffer.from(""));

    const result = openBrowser("http://localhost:3000", "linux");

    expect(result).toBe(true);
    expect(mockExecSync).toHaveBeenCalledTimes(5);
    expect(mockExecSync.mock.calls[4][0]).toMatch(/^firefox /);
  });

  it("returns false and logs when ALL commands fail (win32)", () => {
    mockExecSync.mockImplementation(() => { throw new Error("fail"); });

    const result = openBrowser("http://localhost:3000", "win32");

    expect(result).toBe(false);
    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Could not open browser"),
    );
  });

  it("returns false and logs when ALL commands fail (linux — all 7)", () => {
    mockExecSync.mockImplementation(() => { throw new Error("fail"); });

    const result = openBrowser("http://localhost:3000", "linux");

    expect(result).toBe(false);
    expect(mockExecSync).toHaveBeenCalledTimes(7);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Could not open browser"),
    );
  });

  it("passes shell: true and timeout: 5000 to execSync", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    openBrowser("http://localhost:3000", "linux");

    expect(mockExecSync.mock.calls[0][1]).toMatchObject({
      stdio: "ignore",
      timeout: 5000,
      shell: true,
    });
  });
});
