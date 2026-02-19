#!/usr/bin/env bash
# Git pre-commit hook: when action button files are staged,
# sync tests to use constants and run fast component tests.
#
# E2E tests (LLM-dependent, server-dependent) are excluded from
# pre-commit. Run them via: pnpm test:e2e
#
# Install: husky (via pnpm install) or manually:
#   cp scripts/pre-commit-action-buttons.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -e
cd "$(git rev-parse --show-toplevel)"

staged=$(git diff --cached --name-only)
has_action_change=false
for f in $staged; do
  case "$f" in
    *workflow-block.tsx|*header.tsx|*story-map-canvas.tsx|*implementation-card.tsx|*action-buttons.ts)
      has_action_change=true
      break
      ;;
  esac
done

[[ "$has_action_change" != "true" ]] && exit 0

echo "[pre-commit] Action button files changed — syncing tests and running component tests..."
node scripts/sync-action-button-tests.mjs
pnpm vitest run __tests__/components/workflow-block.test.tsx __tests__/components/header.test.tsx __tests__/components/implementation-card.test.tsx --reporter=verbose
