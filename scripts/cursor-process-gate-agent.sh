#!/usr/bin/env bash
# Run from repo root after the agent has posted the full process checklist (rules,
# requirements, uncertainty, TDD plan). Clears any prior user "proceed" so a new
# proceed is required for this cycle.
#
# If instead the agent concludes **BLOCKED / do not proceed** (uncertainty,
# missing requirements, tests not written, etc.): do **not** run
# cursor-process-gate-proceed.sh. Optionally run cursor-process-gate-reset.sh to
# remove the .agent flag so the workspace is not left mid-cycle.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "cursor-process-gate-agent: not inside a git repo" >&2
  exit 1
fi
LOCK_DIR="${DOSSIER_SCOPE_LOCK_DIR:-/tmp/dossier-scope-locks}"
mkdir -p "$LOCK_DIR"
HASH="$(printf '%s' "$ROOT" | shasum -a 256 2>/dev/null | awk '{print $1}')"
if [[ -z "$HASH" ]]; then
  HASH="$(printf '%s' "$ROOT" | sha256sum 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "$HASH" ]]; then
  echo "cursor-process-gate-agent: need shasum or sha256sum" >&2
  exit 1
fi
rm -f "${LOCK_DIR}/${HASH}.proceed"
touch "${LOCK_DIR}/${HASH}.agent"
echo "Process gate: agent checklist recorded for workspace hash ${HASH:0:8}… (user must say proceed, then run cursor-process-gate-proceed.sh)"
