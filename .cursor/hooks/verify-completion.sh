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

LOCK_DIR="/tmp/dossier-scope-locks"
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
  "followup_message": "Run the COMPLETION VERIFICATION checklist now. Show evidence for every item:\n\n### COMPLETION VERIFICATION\n\n- [ ] All unit tests passing (show output)\n- [ ] All integration tests passing (show output)\n- [ ] All e2e tests passing (show output)\n- [ ] No new linter errors (show output)\n- [ ] No new type errors (show output)\n- [ ] Uncertainty register resolved\n- [ ] All acceptance criteria met (state criteria and show evidence per criterion)\n- [ ] Basic CRUD operations verified by test (show output)\n- [ ] Related product documentation identified and updated (if applicable)\n- [ ] Answer 'Would you bet your family's financial future on this?' with a yes and explain why\n- [ ] Flow boundary preserved (Next.js API route remains FE boundary)\n  - Evidence: file diffs showing changes only in app/api/** and/or server code\n- [ ] No legacy table writes\n  - Evidence: grep outputs show no .insert/.update/.delete on invitation_offers, booking_participants, external cache\n- [ ] Timezone compliance\n  - Evidence: new/changed records persist start_local, end_local, tzid; DB generating start_utc, end_utc\n- [ ] Migrations path compliance\n  - Evidence: only lib/db/sqlite-migrations/** changed (no Alembic)\n- [ ] Stable endpoints unchanged or documented\n  - Evidence: list endpoints touched vs doc anchors in #stable-endpoints\n- [ ] Red-flag status and ADR (if any)\n  - Evidence: ADR link + approval\n- [ ] Boundary exceptions (if any) documented\n  - Evidence: list files permitted to call backend directly and justification\n- [ ] Test logging removed, replace with Sentry spans if required\n  - Evidence: no secrets/PII logged; Sentry only in prod paths\n\nShow evidence for each checkbox.\n\n**Ready for Production?**: YES / NO\n\n**If NO, blocking items**:\n- [List specific items that must be resolved before production]"
}
HOOKEOF
