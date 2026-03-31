#!/bin/bash
# stop hook: triggers verify-completion checklist when agent completes a task
# Only fires when ALL conditions are met:
#   1. Agent mode (set by sessionStart env)
#   2. Status is "completed" and first stop (loop_count 0)
#   3. Substantial code changes exist (>= threshold lines changed in code files)

input=$(cat)

status=$(echo "$input" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
loop_count=$(echo "$input" | grep -o '"loop_count"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | grep -o '[0-9]*$')

LINES_CHANGED_THRESHOLD=20

has_substantial_changes() {
  local project_dir="${CURSOR_PROJECT_DIR:-$(pwd)}"
  cd "$project_dir" 2>/dev/null || return 1

  local conversation_id
  conversation_id=$(echo "$input" | grep -o '"conversation_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

  local snapshot_file="/tmp/dossier-git-snapshots/${conversation_id}.diff-start"
  local untracked_snapshot="/tmp/dossier-git-snapshots/${conversation_id}.untracked-start"

  # No snapshot means sessionStart didn't run with the new hook — skip to avoid false positives
  if [ ! -f "$snapshot_file" ]; then
    return 1
  fi

  # Current totals for code files (staged + unstaged)
  local current_lines
  current_lines=$(git diff --numstat -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.sh' '*.css' '*.scss' '*.sql' 2>/dev/null \
    | awk '{s+=$1+$2} END {print s+0}')
  local staged_lines
  staged_lines=$(git diff --cached --numstat -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.sh' '*.css' '*.scss' '*.sql' 2>/dev/null \
    | awk '{s+=$1+$2} END {print s+0}')

  # Baseline from session start snapshot
  local baseline_lines=0
  if [ -f "$snapshot_file" ]; then
    baseline_lines=$(grep -E '\.(ts|tsx|js|jsx|py|sh|css|scss|sql)$' "$snapshot_file" 2>/dev/null \
      | awk '{s+=$1+$2} END {print s+0}')
  fi

  # Untracked code files — subtract those that existed at session start
  local untracked_lines=0
  local baseline_untracked_file_list=""
  if [ -f "$untracked_snapshot" ]; then
    baseline_untracked_file_list=$(cat "$untracked_snapshot")
  fi
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    # Skip files that existed at session start
    if echo "$baseline_untracked_file_list" | grep -qxF "$f"; then
      continue
    fi
    local n
    n=$(wc -l < "$f" 2>/dev/null)
    untracked_lines=$((untracked_lines + n))
  done <<< "$(git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.sh' '*.css' '*.scss' '*.sql' 2>/dev/null)"

  # Session delta = (current state) - (baseline at session start)
  # Untracked files are counted fully since we can't diff them against a baseline
  local session_lines=$(( (current_lines + staged_lines + untracked_lines) - baseline_lines ))
  # Guard against negative (e.g. if files were cleaned up during session)
  [ "$session_lines" -lt 0 ] && session_lines=0

  [ "$session_lines" -ge "$LINES_CHANGED_THRESHOLD" ]
}

if [ "$CURSOR_COMPOSER_MODE" = "agent" ] && [ "$status" = "completed" ] && [ "$loop_count" = "0" ] && has_substantial_changes; then
  cat << 'HOOKEOF'
{
  "followup_message": "Run the COMPLETION VERIFICATION checklist now. Show evidence for every item:\n\n### COMPLETION VERIFICATION\n\n**Build & Type Safety**\n- [ ] TypeScript: no new type errors (`npx tsc --noEmit` — show output)\n- [ ] ESLint: no new lint errors (`npx eslint . --max-warnings 0` — show output)\n\n**Tests**\n- [ ] Unit tests: all passing (`npm test` — show output; covers actions, schemas, mutations, lib, orchestration, electron, components, hooks, db, llm, examples)\n- [ ] Planning tests: stream parser passing (`npm run test:planning` — show output)\n- [ ] API contract tests: passing or gracefully skipped (skip expected when server not running — confirm skip reason)\n\n**Acceptance Criteria**\n- [ ] All stated acceptance criteria met — list each criterion and show evidence\n\n**Architectural Invariants**\n- [ ] PlanningAction pipeline preserved: all mutations flow via `validate → apply → persist`; no direct DB writes to map tables\n  - Evidence: grep/diff shows no raw inserts/updates outside the apply-action layer (`__tests__/actions/`, `__tests__/mutations/` passing)\n- [ ] LLM stream parser backwards-compatible: handles wrapper JSON, markdown code blocks, token-by-token streaming, and clarification responses\n  - Evidence: `__tests__/lib/llm/stream-action-parser.test.ts` passing\n- [ ] Build orchestration invariants intact: single-build lock per project, auto-commit sequence unchanged, all git calls use spawnSync arg arrays (no shell string interpolation)\n  - Evidence: `__tests__/orchestration/` passing; grep shows no `exec`/`shell: true` git calls\n- [ ] DB adapter seam intact: no raw SQL or direct `better-sqlite3` calls in business logic files outside `lib/db/**`\n  - Evidence: grep output showing no `.prepare(` / `.run(` outside db layer\n- [ ] Card and project finalization gates intact: build cannot trigger without `card.finalized_at`; project must be finalized first\n  - Evidence: `__tests__/orchestration/trigger-build.test.ts` passing\n- [ ] Approval gate logic intact: `canApprove` is false when any required check is missing, failed, or skipped\n  - Evidence: `__tests__/orchestration/approval-gates.test.ts` passing (or confirm file absent and gate logic unchanged)\n- [ ] Planning credential routing intact: exactly two paths (Agent SDK or CLI subprocess); Messages API path NOT re-introduced\n  - Evidence: `__tests__/llm/` passing; grep confirms no Anthropic Messages API direct calls in planning pipeline\n- [ ] GitHub token resolution priority order intact: PKCE OAuth flow, DOSSIER_GITHUB_IGNORE_ENV flag, config file vs env priority unchanged\n  - Evidence: `__tests__/lib/github/` and `__tests__/api/github-oauth-routes.test.ts` passing\n- [ ] Electron runtime invariants intact: data-dir resolution and bundled Node binary resolution unchanged\n  - Evidence: `__tests__/electron/` passing\n- [ ] API route boundary intact: Next.js `app/api/**` routes remain the FE/BE boundary; no direct DB calls from React components\n  - Evidence: diff shows no `.prepare(` / DbAdapter imports in `components/**` or `app/**/page.tsx`\n- [ ] Migrations path compliance: schema changes only in `lib/db/sqlite-migrations/**`; no Alembic, no Postgres-only migrations, no ad-hoc schema SQL outside migrations\n  - Evidence: diff of changed migration-related files\n\n**Documentation**\n- [ ] Documentation updated if any user-facing behavior changed (identify docs files touched or confirm no update needed)\n\n**Production Readiness**\n- [ ] Answer 'Would you bet your family's financial future on this?' with YES and explain why\n\nShow evidence for each checkbox.\n\n**Ready for Production?**: YES / NO\n\n**If NO, blocking items**:\n- [List specific items that must be resolved before production]"
}
HOOKEOF
else
  echo '{}'
fi
