#!/bin/bash
# stop hook: completion verification only after a successful test command in this
# conversation (see mark-test-success.sh). Removes the marker when prompting once.

input=$(cat)

status=$(echo "$input" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
conversation_id=$(echo "$input" | grep -o '"conversation_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$conversation_id" ]; then
  echo '{}'
  exit 0
fi

LOCK_DIR="${DOSSIER_SCOPE_LOCK_DIR:-/tmp/dossier-scope-locks}"
STAMP_FILE="$LOCK_DIR/$conversation_id.tests-verified"

if [ "$CURSOR_COMPOSER_MODE" != "agent" ]; then
  echo '{}'
  exit 0
fi

if [ "$status" != "completed" ]; then
  echo '{}'
  exit 0
fi

if [ ! -f "$STAMP_FILE" ]; then
  echo '{}'
  exit 0
fi

rm -f "$STAMP_FILE"

cat << 'HOOKEOF'
{
  "followup_message": "Run the COMPLETION VERIFICATION checklist now. Show evidence for every item:\n\n### COMPLETION VERIFICATION (Dossier)\n\n- [ ] npm run test — paste Vitest summary (expect exit 0)\n- [ ] npm run lint — paste output (expect exit 0)\n- [ ] npx tsc --noEmit — paste output (expect exit 0)\n- [ ] npm run test:e2e — paste summary; report skipped tests and why (e.g. dev server down, TEST_BASE_URL, DOSSIER_E2E_STRICT_BUILD)\n- [ ] Uncertainty register resolved for this task\n- [ ] Acceptance criteria — restate user or ticket criteria and give evidence per item\n- [ ] Domain coverage — planning/mutations/orchestration tests and/or API contract tests, or N/A with reason\n- [ ] Documentation — update docs/, README, or .env.example if behavior or configuration changed; else N/A\n- [ ] Change scope — list main paths touched (app/, lib/, components/, electron/, etc.) and confirm they match the request\n- [ ] Database — if you changed schema or lib/db/migrate.ts, describe the migration; else N/A\n- [ ] Secrets — confirm no API keys/tokens logged or exposed in client bundles\n- [ ] npm run build — run when production routes, middleware, or packaging-relevant code changed; else N/A with reason\n- [ ] ADR / architecture — cite docs/adr if the change intersects an ADR or needs a follow-up; else N/A\n\n**Ready for production?** YES / NO (be honest: skipped e2e or skipped build means NO unless you explain)\n\n**If NO — blocking items:**\n- [List what is still required]\n\nUse concrete command output for checks; do not claim e2e fully passed if most tests were skipped."
}
HOOKEOF
