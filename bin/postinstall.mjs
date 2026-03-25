#!/usr/bin/env node

/**
 * Postinstall: ensure native addons are available for the current platform
 * inside the standalone output directory.
 *
 * The npm tarball ships without precompiled .node binaries because CI builds
 * on Linux and the binaries wouldn't work on macOS/Windows. This script runs
 * after `npm install` / `npx` and installs them fresh so prebuild-install
 * (bundled with better-sqlite3) fetches the correct prebuilt binary.
 *
 * If prebuild-install fails (e.g. no GitHub access), it falls back to
 * node-gyp which requires a C++ compiler. On Windows, that means Visual
 * Studio Build Tools with the C++ workload.
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

let hadCriticalFailure = false;

for (const pkg of packages) {
  try {
    execSync(
      `npm install ${pkg} --no-save --no-package-lock`,
      { stdio: "pipe", cwd: standaloneDir, timeout: 120_000 }
    );
    console.log(`[dossier] ${pkg} installed for ${process.platform}-${process.arch}.`);
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? "";
    const isSqlite = pkg === "better-sqlite3";
    const isGypFailure = stderr.includes("node-gyp") || stderr.includes("gyp ERR");
    const isPrebuildFailure = stderr.includes("prebuild-install") || stderr.includes("tunneling socket");

    if (isSqlite) {
      hadCriticalFailure = true;
      console.error(`[dossier] ERROR: Failed to install ${pkg}.`);
      console.error(`[dossier] Platform: ${process.platform}-${process.arch}, Node: ${process.version}`);

      if (isPrebuildFailure) {
        console.error(`[dossier] Prebuilt binary download failed (network issue or unsupported platform).`);
      }
      if (isGypFailure && process.platform === "win32") {
        console.error("");
        console.error("  Native compilation failed. On Windows, you need Visual Studio Build Tools");
        console.error("  with the 'Desktop development with C++' workload.");
        console.error("");
        console.error("  Quick fix (run in an elevated PowerShell):");
        console.error("    npm install -g windows-build-tools");
        console.error("");
        console.error("  Then re-run: npx @rwliebs/dossier-agentic-product-planner-builder");
        console.error("");
      } else if (isGypFailure) {
        console.error("");
        console.error("  Native compilation failed. Ensure you have build tools installed:");
        console.error("  - macOS: xcode-select --install");
        console.error("  - Ubuntu/Debian: sudo apt install build-essential python3");
        console.error("");
      }
    } else {
      console.warn(`[dossier] WARNING: Failed to install ${pkg}. Some features may not work.`);
    }
  }
}

if (hadCriticalFailure) {
  console.error("[dossier] Dossier requires better-sqlite3. The app will not start without it.");
  process.exit(1);
}
