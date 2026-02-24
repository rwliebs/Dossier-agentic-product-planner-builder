#!/usr/bin/env bash
#
# Rebuild and restart the Dossier dev server.
# Kills any process on port 3000, runs `npm run build`, then starts `npm run dev`.
#
# Usage:
#   ./scripts/rebuild-and-restart.sh       # dev server (default)
#   ./scripts/rebuild-and-restart.sh prod  # production server (next start)
#   ./scripts/rebuild-and-restart.sh bg    # dev server in background
#

set -e
PORT=3000
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Killing process on port $PORT (if any)..."
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    echo "    Killed PID(s): $PIDS"
    echo "    Waiting for port to release..."
    i=0
    while lsof -ti:"$PORT" >/dev/null 2>&1 && [ $i -lt 10 ]; do
      sleep 1
      i=$((i + 1))
    done
    if lsof -ti:"$PORT" >/dev/null 2>&1; then
      echo "    ERROR: Port $PORT still in use after 10s"
      exit 1
    fi
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
elif [ "${1:-}" = "bg" ]; then
  nohup npm run dev > /tmp/dossier-dev.log 2>&1 &
  echo "    Dev server starting in background (logs: /tmp/dossier-dev.log)"
  echo "    Waiting for server to be ready (up to 30s)..."
  i=0
  while [ $i -lt 30 ]; do
    sleep 1
    if lsof -i:"$PORT" 2>/dev/null | grep -q LISTEN; then
      echo "    Ready at http://localhost:$PORT"
      exit 0
    fi
    i=$((i + 1))
  done
  echo "    WARN: Server may still be compiling. Check /tmp/dossier-dev.log"
else
  exec npm run dev
fi
