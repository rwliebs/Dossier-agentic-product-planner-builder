#!/usr/bin/env bash
#
# Rebuild and restart the Dossier dev server.
# Kills any process on port 3000, runs `npm run build`, then starts `npm run dev`.
#
# Usage:
#   ./scripts/rebuild-and-restart.sh       # dev server (default)
#   ./scripts/rebuild-and-restart.sh prod  # production server (next start)
#

set -e
PORT=3000
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Killing process on port $PORT (if any)..."
if command -v lsof >/dev/null 2>&1; then
  PID=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
    echo "    Killed PID(s): $PID"
  else
    echo "    No process found on port $PORT"
  fi
else
  echo "    lsof not found; skipping kill (start may fail if port is in use)"
fi

echo "==> Building..."
npm run build

echo "==> Starting server..."
if [ "${1:-}" = "prod" ]; then
  exec npm run start
else
  exec npm run dev
fi
