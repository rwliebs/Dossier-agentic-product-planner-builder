#!/usr/bin/env node

/**
 * Dossier CLI entry point.
 *
 * Usage:
 *   npx @rwliebs/dossier-agentic-product-planner-builder            — start on default port 3000
 *   npx @rwliebs/dossier-agentic-product-planner-builder --port 8080
 *   npx @rwliebs/dossier-agentic-product-planner-builder --no-open  — don't open browser
 */

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let port = 3000;
let noBrowser = false;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--no-open") {
    noBrowser = true;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
  Dossier — AI-native product craft platform

  Usage:
    npx @rwliebs/dossier-agentic-product-planner-builder [options]

  Options:
    --port, -p <number>   Port to listen on (default: 3000)
    --no-open             Don't open browser automatically
    --help, -h            Show this help message
`);
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Data directory & config
// ---------------------------------------------------------------------------
function getDataDir() {
  if (process.env.DOSSIER_DATA_DIR) return process.env.DOSSIER_DATA_DIR;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".dossier");
}

function loadConfig() {
  const configPath = join(getDataDir(), "config");
  if (!existsSync(configPath)) return;

  const content = readFileSync(configPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// First-run banner
// ---------------------------------------------------------------------------
function printBanner(dataDir, isFirstRun) {
  console.log("");
  console.log("  ┌─────────────────────────────────────┐");
  console.log("  │           D O S S I E R              │");
  console.log("  │   AI-native product craft platform   │");
  console.log("  └─────────────────────────────────────┘");
  console.log("");

  if (isFirstRun) {
    console.log(`  First run detected. Data directory: ${dataDir}`);
    console.log("");
  }

  console.log(`  Starting on http://localhost:${port}`);
  console.log(`  Data:   ${dataDir}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Open browser (cross-platform, no dependency)
// ---------------------------------------------------------------------------
async function openBrowser(url) {
  const { platform } = process;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const dataDir = getDataDir();
  const isFirstRun = !existsSync(dataDir);

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

  // Load config into process.env before starting the server
  loadConfig();

  printBanner(dataDir, isFirstRun);

  // Resolve the standalone server.js
  // In standalone mode, Next.js outputs to .next/standalone/server.js
  const standaloneServer = join(__dirname, "..", ".next", "standalone", "server.js");

  if (!existsSync(standaloneServer)) {
    console.error("  Error: Standalone build not found.");
    console.error("  Run `npm run build` first, or use `npm run dev` for development.");
    console.error("");
    process.exit(1);
  }

  // Start the Next.js standalone server
  const child = spawn("node", [standaloneServer], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
    },
    stdio: "inherit",
    cwd: join(__dirname, "..", ".next", "standalone"),
  });

  child.on("error", (err) => {
    console.error(`  Failed to start server: ${err.message}`);
    process.exit(1);
  });

  // Open browser after a short delay to let the server bind
  if (!noBrowser) {
    setTimeout(() => openBrowser(`http://localhost:${port}`), 2000);
  }

  // Forward signals for clean shutdown
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
      process.exit(0);
    });
  }

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
