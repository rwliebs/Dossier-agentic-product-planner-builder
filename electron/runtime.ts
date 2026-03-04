import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DOSSIER_DATA_DIR) return env.DOSSIER_DATA_DIR;
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return join(home, ".dossier");
}

type ResolveNodeExecutableOptions = {
  isPackaged: boolean;
  resourcesPath?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
};

export function resolveNodeExecutable({
  isPackaged,
  resourcesPath,
  env = process.env,
  platform = process.platform,
  exists = existsSync,
}: ResolveNodeExecutableOptions): string {
  if (isPackaged && resourcesPath) {
    const bundledNode = join(resourcesPath, "node");
    if (exists(bundledNode)) {
      return bundledNode;
    }
  }

  const pathSep = platform === "win32" ? ";" : ":";
  const pathExt = platform === "win32" ? [".exe", ".cmd"] : [""];
  const pathDirs = (env.PATH ?? "").split(pathSep).filter(Boolean);
  for (const dir of pathDirs) {
    for (const ext of pathExt) {
      const candidate = join(dir, `node${ext}`);
      if (exists(candidate)) return candidate;
    }
  }

  const candidates =
    platform === "darwin"
      ? ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
      : platform === "win32"
        ? []
        : ["/usr/bin/node", "/usr/local/bin/node"];

  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }

  return "node";
}
