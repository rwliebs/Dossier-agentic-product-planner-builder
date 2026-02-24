#!/usr/bin/env bash
#
# Run the dev server and restart it when it exits (e.g. killed by OS or IDE).
# Logs to /tmp/dossier-dev.log. Stop with: kill $(lsof -ti:3000)
#
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="/tmp/dossier-dev.log"

echo "==> Dev server with auto-restart (logs: $LOG)"
while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting next dev..." >> "$LOG"
  npm run dev >> "$LOG" 2>&1 || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Exited (code $?). Restarting in 3s..." >> "$LOG"
  sleep 3
done
