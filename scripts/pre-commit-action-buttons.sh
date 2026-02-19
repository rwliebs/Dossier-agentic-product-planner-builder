#!/usr/bin/env bash
# Git pre-commit hook: when action button files are staged,
# 1) sync tests to use constants, 2) run e2e tests.
#
# Install: husky (via pnpm install) or manually:
#   cp scripts/pre-commit-action-buttons.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -e
cd "$(git rev-parse --show-toplevel)"

# Check if any staged file is an action button component or constants
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

echo "[pre-commit] Action button files changed — syncing tests and running e2e..."
node scripts/sync-action-button-tests.mjs
pnpm vitest run __tests__/components/workflow-block.test.tsx __tests__/components/header.test.tsx __tests__/components/implementation-card.test.tsx __tests__/e2e/adaptive-flows.test.ts __tests__/e2e/trading-card-marketplace-planning.test.ts --reporter=verbose
