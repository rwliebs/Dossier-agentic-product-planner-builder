import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getClonePath } from '@/lib/orchestration/repo-manager';
import { findFreePort } from '@/lib/platform/find-free-port';
import open from 'open';

const VIEW_PORT_START = 3001;
const VIEW_PORT_END = 3010;

/**
 * True when the app process is almost certainly running on a remote PaaS/serverless host.
 * Avoid generic CI vars (e.g. GITHUB_ACTIONS) so local and GitHub Actions test runs are unaffected.
 */
function isLikelyHostedCloudRuntime(): boolean {
  const e = process.env;
  if (e.VERCEL) return true;
  if (e.NETLIFY) return true;
  if (e.CF_PAGES === "1") return true;
  if (e.AWS_EXECUTION_ENV) return true;
  if (e.FLY_APP_NAME) return true;
  if (e.RAILWAY_ENVIRONMENT) return true;
  if (e.RENDER) return true;
  if (e.K_SERVICE) return true;
  if (e.HEROKU_APP_NAME) return true;
  return false;
}

/**
 * Next.js `next dev` sets NODE_ENV=development. Standalone (CLI + Electron) runs production
 * builds locally; those entrypoints set DOSSIER_ALLOW_PROJECT_DEV_SERVER=1 so this route
 * still works. On known hosted platforms this stays off even if those vars are set mistakenly.
 */
function isRestartAndOpenEnabled(): boolean {
  if (isLikelyHostedCloudRuntime()) return false;
  if (process.env.NODE_ENV === "development") return true;
  return process.env.DOSSIER_ALLOW_PROJECT_DEV_SERVER === "1";
}

/**
 * POST /api/dev/restart-and-open
 *
 * Starts the project's dev server from its clone (~/.dossier/repos/<projectId>/)
 * and opens it in a new browser tab. Tries ports 3001, 3002, ... until a free port is found.
 * Does not kill or restart the primary Dossier server on 3000.
 * Spawns a detached child process so the API can respond immediately.
 * Disabled on detected hosted runtimes, or unless NODE_ENV=development or
 * DOSSIER_ALLOW_PROJECT_DEV_SERVER=1 (local / Electron / CLI).
 *
 * Body: { projectId: string } (required).
 */
export async function POST(request: Request) {
  if (!isRestartAndOpenEnabled()) {
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
    ...(process.platform === 'win32' && { windowsHide: true }),
  });
  child.on('error', () => {});
  child.unref();
  fs.closeSync(logFd);

  setTimeout(() => {
    open(`http://localhost:${port}`).catch(() => {});
  }, 10_000);

  return NextResponse.json({
    ok: true,
    message: `Starting project server on port ${port} and opening new tab. Page will load in ~10 seconds.`,
  });
}
