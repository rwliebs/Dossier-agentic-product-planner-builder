#!/usr/bin/env node

/**
 * Postinstall: ensure native addons are compiled for the current platform
 * inside the standalone output directory.
 *
 * The npm tarball ships without precompiled .node binaries because CI builds
 * on Linux and the binaries wouldn't work on macOS/Windows. This script runs
 * after `npm install` / `npx` and installs them fresh so prebuild-install
 * (or N-API optional deps) fetches the correct platform binary.
 *
 * Skips itself when run inside the source repo (detected by the presence of
 * next.config.mjs) to avoid interfering with development.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const standaloneDir = join(root, ".next", "standalone");
const standaloneModules = join(standaloneDir, "node_modules");

// Skip if this is the source repo (has next.config.mjs) — dev installs
// don't need to rebuild native deps into standalone output.
if (existsSync(join(root, "next.config.mjs"))) {
  process.exit(0);
}

// Skip if standalone build isn't present
if (!existsSync(join(standaloneDir, "server.js"))) {
  process.exit(0);
}

mkdirSync(standaloneModules, { recursive: true });

// npm install needs a package.json in the target directory
const standalonePackageJson = join(standaloneDir, "package.json");
if (!existsSync(standalonePackageJson)) {
  writeFileSync(standalonePackageJson, JSON.stringify({ private: true }, null, 2));
}

const packages = ["better-sqlite3", "ruvector-core"];

for (const pkg of packages) {
  try {
    execSync(
      `npm install ${pkg} --no-save --no-package-lock`,
      { stdio: "pipe", cwd: standaloneDir }
    );
    console.log(`[dossier] ${pkg} installed for ${process.platform}-${process.arch}.`);
  } catch (err) {
    console.warn(`[dossier] WARNING: Failed to install ${pkg}. Some features may not work.`);
  }
}
