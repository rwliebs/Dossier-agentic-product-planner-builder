#!/usr/bin/env bash
# Run from repo root only after the user has said "proceed" in chat (following
# the agent's posted checklist). Usually invoked by the agent in the same turn
# as it interprets the user's proceed.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "cursor-process-gate-proceed: not inside a git repo" >&2
  exit 1
fi
LOCK_DIR="${DOSSIER_SCOPE_LOCK_DIR:-/tmp/dossier-scope-locks}"
mkdir -p "$LOCK_DIR"
HASH="$(printf '%s' "$ROOT" | shasum -a 256 2>/dev/null | awk '{print $1}')"
if [[ -z "$HASH" ]]; then
  HASH="$(printf '%s' "$ROOT" | sha256sum 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "$HASH" ]]; then
  echo "cursor-process-gate-proceed: need shasum or sha256sum" >&2
  exit 1
fi
if [[ ! -f "${LOCK_DIR}/${HASH}.agent" ]]; then
  echo "cursor-process-gate-proceed: missing agent step — run scripts/cursor-process-gate-agent.sh first (after posting checklist)" >&2
  exit 1
fi
touch "${LOCK_DIR}/${HASH}.proceed"
echo "Process gate: user proceed recorded for workspace hash ${HASH:0:8}… — writes are allowed until agent starts a new checklist cycle."
