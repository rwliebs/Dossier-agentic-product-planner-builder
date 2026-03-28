#!/bin/bash
# sessionStart hook: set composer mode for downstream hooks (no injected checklist).
# Process / TDD checklist runs only when the agent attempts the first file change
# (see gate-first-edit.sh via preToolUse).

input=$(cat)

composer_mode=$(echo "$input" | grep -o '"composer_mode"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

cat << HOOKEOF
{
  "env": { "CURSOR_COMPOSER_MODE": "${composer_mode:-unknown}" },
  "continue": true
}
HOOKEOF
