import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

/**
 * POST /api/dev/restart-and-open
 *
 * Kills the dev server on port 3000, restarts it, and opens the browser.
 * Spawns a detached child process so the API can respond before the server is killed.
 * Dev-only: intended for local development workflow.
 */
export async function POST() {
  const root = path.resolve(process.cwd());
  const port = 3000;
  const url = `http://localhost:${port}`;

  // Script: wait for API response, kill server, restart (detached), wait for ready, open browser
  const script = [
    `sleep 2`,
    `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`,
    `cd "${root}" && nohup npm run dev > /tmp/dossier-dev.log 2>&1 &`,
    `sleep 10`,
    `(command -v open >/dev/null 2>&1 && open "${url}") || (command -v xdg-open >/dev/null 2>&1 && xdg-open "${url}") || true`,
  ].join(' && ');

  const child = spawn('bash', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    cwd: root,
  });
  child.unref();

  return NextResponse.json({
    ok: true,
    message: 'Restarting server and opening browser. Page will load in ~10 seconds.',
  });
}
