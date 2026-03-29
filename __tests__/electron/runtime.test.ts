import { describe, expect, it } from "vitest";
import { getDataDir, resolveNodeExecutable } from "@/electron/runtime";

describe("electron runtime helpers", () => {
  it("prefers DOSSIER_DATA_DIR over HOME", () => {
    const dataDir = getDataDir({
      DOSSIER_DATA_DIR: "/tmp/custom-dossier",
      HOME: "/Users/example",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(dataDir).toBe("/tmp/custom-dossier");
  });

  it("uses bundled node when packaged", () => {
    const resolved = resolveNodeExecutable({
      isPackaged: true,
      resourcesPath: "/app/Contents/Resources",
      exists: (path) => path === "/app/Contents/Resources/node",
      env: { PATH: "", NODE_ENV: "test" } as NodeJS.ProcessEnv,
      platform: "darwin",
    });

    expect(resolved).toBe("/app/Contents/Resources/node");
  });

  it("falls back to PATH node when bundle is absent", () => {
    const resolved = resolveNodeExecutable({
      isPackaged: true,
      resourcesPath: "/app/Contents/Resources",
      exists: (path) => path === "/usr/local/bin/node",
      env: { PATH: "/usr/local/bin:/usr/bin", NODE_ENV: "test" } as NodeJS.ProcessEnv,
      platform: "darwin",
    });

    expect(resolved).toBe("/usr/local/bin/node");
  });
});
