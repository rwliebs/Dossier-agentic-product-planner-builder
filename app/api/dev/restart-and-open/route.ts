import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getClonePath } from '@/lib/orchestration/repo-manager';
import { findFreePort } from '@/lib/platform/find-free-port';
import { openBrowser } from '@/lib/platform/open-browser';

const VIEW_PORT_START = 3001;
const VIEW_PORT_END = 3010;

/**
 * POST /api/dev/restart-and-open
 *
 * Starts the project's dev server from its clone (~/.dossier/repos/<projectId>/)
 * and opens it in a new browser tab. Tries ports 3001, 3002, ... until a free port is found.
 * Does not kill or restart the primary Dossier server on 3000.
 * Spawns a detached child process so the API can respond immediately.
 * Dev-only: disabled in production to prevent unauthenticated DoS.
 *
 * Body: { projectId: string } (required).
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected { projectId: string }." },
      { status: 400 }
    );
  }

  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : undefined;
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required. Send { projectId: string } in the request body." },
      { status: 400 }
    );
  }

  const clonePath = getClonePath(projectId);
  if (!fs.existsSync(clonePath)) {
    return NextResponse.json(
      {
        error: "Project repo not cloned yet. Run a build first so the repo exists at ~/.dossier/repos/<projectId>/.",
      },
      { status: 409 }
    );
  }

  const port = await findFreePort(VIEW_PORT_START, VIEW_PORT_END);

  if (port === null) {
    return NextResponse.json(
      { error: `No free port in ${VIEW_PORT_START}-${VIEW_PORT_END}. All view ports are in use.` },
      { status: 503 }
    );
  }

  const logDir = path.join(os.tmpdir(), 'dossier');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `view-${port}.log`);
  const logFd = fs.openSync(logFile, 'a');

  // `shell: true` resolves `npm` → `npm.cmd` on Windows automatically,
  // and handles PATH lookup on all platforms without platform branching.
  const child = spawn('npm', ['run', 'dev'], {
    detached: true,
    shell: true,
    stdio: ['ignore', logFd, logFd],
    cwd: clonePath,
    env: { ...process.env, PORT: String(port) },
    // Suppress visible console window on Windows (detached opens one by default).
    ...(process.platform === 'win32' && { windowsHide: true }),
  });
  child.on('error', () => {});
  child.unref();
  // Close the fd in the parent — the child inherits its own copy.
  fs.closeSync(logFd);

  setTimeout(() => {
    openBrowser(`http://localhost:${port}`);
  }, 10_000);

  return NextResponse.json({
    ok: true,
    message: `Starting project server on port ${port} and opening new tab. Page will load in ~10 seconds.`,
  });
}
