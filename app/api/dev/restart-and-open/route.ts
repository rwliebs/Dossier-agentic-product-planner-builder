import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const VIEW_PORT_START = 3001;
const VIEW_PORT_END = 3010;

async function findFreePort(): Promise<number | null> {
  for (let port = VIEW_PORT_START; port <= VIEW_PORT_END; port++) {
    try {
      await execAsync(`lsof -ti :${port}`, { encoding: 'utf8' });
      // lsof returned output = port in use
    } catch {
      // lsof exited non-zero = port free
      return port;
    }
  }
  return null;
}

/**
 * POST /api/dev/restart-and-open
 *
 * Starts a second dev server and opens it in a new browser tab.
 * Tries ports 3001, 3002, ... until a free port is found.
 * Does not kill or restart the primary server on 3000.
 * Spawns a detached child process so the API can respond immediately.
 * Dev-only: disabled in production to prevent unauthenticated DoS.
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const root = path.resolve(process.cwd());
  const port = await findFreePort();

  if (port === null) {
    return NextResponse.json(
      { error: `No free port in ${VIEW_PORT_START}-${VIEW_PORT_END}. All view ports are in use.` },
      { status: 503 }
    );
  }

  const script = [
    `cd "${root}" && PORT=${port} nohup npm run dev > /tmp/dossier-view-${port}.log 2>&1 &`,
    `sleep 10`,
    `(command -v open >/dev/null 2>&1 && open "http://localhost:${port}") || (command -v xdg-open >/dev/null 2>&1 && xdg-open "http://localhost:${port}") || true`,
  ].join(' && ');

  const child = spawn('bash', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    cwd: root,
  });
  child.unref();

  return NextResponse.json({
    ok: true,
    message: `Starting second server on port ${port} and opening new tab. Page will load in ~10 seconds.`,
  });
}
