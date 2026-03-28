#!/usr/bin/env bash
# Clear the process gate for this workspace (both agent + user flags).
# Use when the agent declines to proceed (blocked / needs clarification), the task
# is cancelled, or you want to discard a checklist cycle without unlocking writes.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "cursor-process-gate-reset: not inside a git repo" >&2
  exit 1
fi
LOCK_DIR="${DOSSIER_SCOPE_LOCK_DIR:-/tmp/dossier-scope-locks}"
HASH="$(printf '%s' "$ROOT" | shasum -a 256 2>/dev/null | awk '{print $1}')"
if [[ -z "$HASH" ]]; then
  HASH="$(printf '%s' "$ROOT" | sha256sum 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "$HASH" ]]; then
  echo "cursor-process-gate-reset: need shasum or sha256sum" >&2
  exit 1
fi
rm -f "${LOCK_DIR}/${HASH}.agent" "${LOCK_DIR}/${HASH}.proceed"
echo "Process gate: cleared for workspace hash ${HASH:0:8}…"
