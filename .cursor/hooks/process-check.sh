#!/bin/bash
# sessionStart hook: injects process-check checklist and sets composer mode env var

input=$(cat)

composer_mode=$(echo "$input" | grep -o '"composer_mode"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ "$composer_mode" = "agent" ]; then
  cat << 'HOOKEOF'
{
  "env": { "CURSOR_COMPOSER_MODE": "agent" },
  "additional_context": "### MANDATORY PROCESS CHECK — RUN BEFORE ANY IMPLEMENTATION\n\nYou MUST complete this checklist at the start of every chat before writing any code.\n\n#### 1. RULES AUDIT\n\nList all applicable mandatory rules for the current task from:\n- Cursor AI Rules (repo_specific_rule)\n- Mode-specific rules (mode_specific_rule)\n- User rules (user_rules)\n\nFormat:\n- [ ] Rule: [exact quote]\n- [ ] Compliance: [how I will comply]\n\n#### 2. ARCHITECTURE AUDIT\n\nMap data flows directly impacted by the current task after examining:\n- /Users/richardliebrecht/PYE/pye/docs/Architecture/SYSTEM_ARCHITECTURE_CONSOLIDATED.md\n- code files that are directly impacted by the current task\n\nFormat:\n- For input/creation flows: [UI component] -> [Frontend service] -> [Next.js API] -> [Backend API] -> [Backend service] -> [Database fields]\n- For retrieval flows: [UI component] -> [Frontend service] -> [Next.js API] -> [Backend API] -> [Database fields] -> [Backend service] -> [Backend API] -> [Next.js API] -> [Frontend service] -> [UI component]\n- For update/deletion flows: [UI component] -> [Frontend service] -> [Next.js API] -> [Backend API] -> [Backend service] -> [Database fields] -> [Backend API] -> [Next.js API] -> [Frontend service] -> [UI component]\n\n#### 3. REQUIREMENTS AUDIT\n\nList all applicable requirements for the current task from:\n- User requirements (user_requirements)\n- Technical requirements (technical_requirements)\n- Design requirements (design_requirements)\n\nFormat:\n- [ ] Requirement: user can [outcome] by [action]\n- [ ] Source: [Document name] OR [File name] OR [Code snippet] OR [exact quote]\n\n#### 4. UNCERTAINTY REGISTER\n\n**KNOWN**: [verified facts]\n**UNKNOWN**: [items needing investigation]\n**ASSUMED**: [any assumptions — BLOCKING if not empty]\n\n**Status**: CLEAR / BLOCKED\n\n#### 5. TDD VERIFICATION\n\nTests required before implementation:\n- Test 1: [outcomes tested] — Status: NOT WRITTEN\n- Test 2: [outcomes tested] — Status: NOT WRITTEN\n\n**Can write code?**: NO (tests must be written first)\n\n#### 6. READINESS CHECKLIST\n\n- [ ] Rules consulted and understood\n- [ ] Architecture consulted and understood\n- [ ] Requirements consulted and understood\n- [ ] Uncertainty register clear\n- [ ] Tests written covering all user outcomes and failing\n- [ ] Ready for implementation\n\n**PROCEED**: YES / NO\n\nIf NO, list blocking items.\n\n---\n\nAfter showing this checklist:\n- If status is NO: Do NOT implement until blocks are resolved\n- If status is YES: Await the user's 'proceed' command\n- User will reject work if implementation starts without showing this checklist",
  "continue": true
}
HOOKEOF
else
  # Non-agent modes: set env var but skip the process-check context
  cat << HOOKEOF
{
  "env": { "CURSOR_COMPOSER_MODE": "${composer_mode:-unknown}" },
  "continue": true
}
HOOKEOF
fi
