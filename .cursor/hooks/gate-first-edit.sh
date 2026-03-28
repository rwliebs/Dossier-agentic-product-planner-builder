#!/bin/bash
# preToolUse hook (matcher: Write | Delete)
# Unlocks only when BOTH are true for this workspace:
#   1) Agent ran scripts/cursor-process-gate-agent.sh after posting the checklist
#   2) User said "proceed" and the agent ran scripts/cursor-process-gate-proceed.sh
#
# Emergency (local only): export DOSSIER_CURSOR_GATE_BYPASS=1 before starting Cursor.

input=$(cat)

if [[ "${DOSSIER_CURSOR_GATE_BYPASS:-}" == "1" ]]; then
  echo '{"permission":"allow"}'
  exit 0
fi

conversation_id=$(echo "$input" | grep -o '"conversation_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$conversation_id" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

LOCK_DIR="${DOSSIER_SCOPE_LOCK_DIR:-/tmp/dossier-scope-locks}"
mkdir -p "$LOCK_DIR"

file_path=$(echo "$input" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$file_path" ]; then
  file_path=""
fi

# Resolve git / Cursor workspace root from the target path (or cwd).
resolve_workspace_root() {
  local f="$1"
  if [ -n "$f" ]; then
    if [[ "$f" != /* ]]; then
      f="${PWD%/}/$f"
    fi
    local d
    d=$(dirname "$f")
    while [ "$d" != "/" ]; do
      if [ -d "$d/.git" ]; then
        echo "$d"
        return 0
      fi
      if [ -f "$d/.cursor/hooks.json" ]; then
        echo "$d"
        return 0
      fi
      d=$(dirname "$d")
    done
  fi
  if git rev-parse --show-toplevel 2>/dev/null; then
    return 0
  fi
  echo ""
}

workspace_root="$(resolve_workspace_root "$file_path")"
workspace_hash=""
if [ -n "$workspace_root" ]; then
  workspace_hash=$(printf '%s' "$workspace_root" | shasum -a 256 2>/dev/null | awk '{print $1}')
  if [ -z "$workspace_hash" ]; then
    workspace_hash=$(printf '%s' "$workspace_root" | sha256sum 2>/dev/null | awk '{print $1}')
  fi
fi

AGENT_FLAG=""
PROCEED_FLAG=""
if [ -n "$workspace_hash" ]; then
  AGENT_FLAG="$LOCK_DIR/${workspace_hash}.agent"
  PROCEED_FLAG="$LOCK_DIR/${workspace_hash}.proceed"
fi

if [ -n "$AGENT_FLAG" ] && [ -f "$AGENT_FLAG" ] && [ -f "$PROCEED_FLAG" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# Legacy: per-conversation single lock (if you still create it manually)
LEGACY_LOCK="$LOCK_DIR/$conversation_id.lock"
if [ -f "$LEGACY_LOCK" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

display_path="$file_path"
if [ -z "$display_path" ]; then
  display_path="(see tool input for target path)"
fi

mkdir -p "$LOCK_DIR"

cat << HOOK_EOF
{
  "permission": "deny",
  "user_message": "⛔ First code change blocked — complete the process checklist before edits.",
  "agent_message": "BLOCKED: process gate — dual consent required before Write/Delete.\\n\\n1) Post the full checklist (scope, rules, requirements, uncertainty, TDD).\\n2) From repo root run: bash scripts/cursor-process-gate-agent.sh\\n3) WAIT for the user to reply **proceed**.\\n4) Then run: bash scripts/cursor-process-gate-proceed.sh\\n\\nIf the answer is **no / blocked**: do not run proceed.sh; optionally bash scripts/cursor-process-gate-reset.sh\\n\\nBoth flags must exist under ${LOCK_DIR}/ for this workspace (hash from git root).\\nEmergency bypass (local): DOSSIER_CURSOR_GATE_BYPASS=1\\nLegacy: touch ${LOCK_DIR}/\${conversation_id}.lock"
}
HOOK_EOF
exit 0
