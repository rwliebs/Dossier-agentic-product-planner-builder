/**
 * Electron main process for Dossier.
 * Spawns the Next.js standalone server and opens a BrowserWindow.
 */

import { app, BrowserWindow, dialog } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, resolveNodeExecutable } from "./runtime";
import { handleActivateWindow } from "./window-lifecycle";

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3000;
let logPath: string | null = null;
let isServerReady = false;

function getServerUrl(): string {
  return `http://localhost:${serverPort}`;
}

// ---------------------------------------------------------------------------
// Data directory & config (mirrors bin/dossier.mjs)
// ---------------------------------------------------------------------------
function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.log(line.trim());
  if (logPath) {
    try {
      appendFileSync(logPath, line, { encoding: "utf-8" });
    } catch {
      // Ignore file logging errors; console output remains available.
    }
  }
}

function loadConfig(): void {
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

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const net = require("node:net");
    const server = net.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", () => findFreePort(startPort + 1).then(resolve));
  });
}

function waitForServer(url: string, maxAttempts = 150): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          attempts++;
          if (attempts >= maxAttempts) reject(new Error(`Server failed to start after ${maxAttempts} attempts`));
          else setTimeout(check, 500);
        });
    };
    check();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Dossier",
  });

  mainWindow.loadURL(`data:text/html,<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;font-size:1.2em;color:%23666">Starting Dossier...</div>`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function loadAppUrlIfReady(window: BrowserWindow | null): void {
  if (!window || !isServerReady) return;
  log(`Loading app URL into window: ${getServerUrl()}`);
  window.loadURL(getServerUrl());
}

async function startNextServer(appPath: string): Promise<void> {
  let standaloneDir: string;
  if (app.isPackaged) {
    // extraResource places files next to app.asar in Contents/Resources/
    standaloneDir = join(process.resourcesPath, "standalone");
  } else {
    standaloneDir = join(appPath, ".next", "standalone");
  }
  const serverJs = join(standaloneDir, "server.js");
  log(`Electron packaged=${app.isPackaged} resourcesPath=${process.resourcesPath}`);
  log(`Resolved standaloneDir=${standaloneDir}`);
  log(`Resolved serverJs=${serverJs}`);
  log(`serverJsExists=${existsSync(serverJs)}`);

  if (!existsSync(serverJs)) {
    throw new Error(
      "Standalone build not found. Run `pnpm run build` first, or use `pnpm run dev` for development."
    );
  }

  serverPort = await findFreePort(3000);
  const nodeExec = resolveNodeExecutable({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  log(`Resolved node executable: ${nodeExec}`);

  const dataDir = getDataDir();
  serverProcess = spawn(nodeExec, [serverJs], {
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOSTNAME: "127.0.0.1",
      DOSSIER_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    cwd: standaloneDir,
  });

  serverProcess.stdout?.on("data", (data: Buffer) => {
    log(`[next] ${data.toString().trim()}`);
  });
  serverProcess.stderr?.on("data", (data: Buffer) => {
    log(`[next:err] ${data.toString().trim()}`);
  });

  const startupFailure = new Promise<never>((_, reject) => {
    serverProcess?.once("error", (err) => {
      reject(new Error(`Failed to spawn server process: ${String(err)}`));
    });
    serverProcess?.once("exit", (code, signal) => {
      reject(new Error(`Server exited before readiness (code=${String(code)}, signal=${String(signal)})`));
    });
  });

  await Promise.race([
    waitForServer(`http://127.0.0.1:${serverPort}`),
    startupFailure,
  ]);
  isServerReady = true;
}

function killServer(): void {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  isServerReady = false;
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.focus();
    }
  });

  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
  const logsDir = join(dataDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  logPath = join(logsDir, "electron-main.log");
  log(`App starting. Data dir: ${dataDir}`);
  loadConfig();

  app.setName("Dossier");

  await app.whenReady();

  createWindow();

  const appPath = app.getAppPath();
  try {
    await startNextServer(appPath);
  } catch (err) {
    const message = `Server startup failed: ${String(err)}`;
    log(message);
    if (mainWindow) {
      mainWindow.loadURL(`data:text/html,<h2 style="font-family:system-ui;padding:2em">Dossier failed to start the server.<br><small>${String(err)}</small><br><small>See logs at ${join(dataDir, "logs", "electron-main.log")}</small></h2>`);
    }
    dialog.showErrorBox("Dossier startup error", `${message}\n\nLogs: ${join(dataDir, "logs", "electron-main.log")}`);
    return;
  }
  loadAppUrlIfReady(mainWindow);

  app.on("window-all-closed", () => {
    killServer();
    app.quit();
  });

  app.on("before-quit", () => {
    killServer();
  });

  app.on("activate", () => {
    handleActivateWindow({
      windowCount: BrowserWindow.getAllWindows().length,
      isServerReady,
      createWindow,
      loadAppUrl: () => loadAppUrlIfReady(mainWindow),
    });
  });
}

main().catch((err) => {
  console.error(err);
  app.quit();
});
