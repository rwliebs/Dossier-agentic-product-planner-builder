/**
 * O10.5: Task description builder.
 * Translates DispatchPayload into claude-flow task description with process check,
 * planned files, constraints, acceptance criteria, and completion verification.
 *
 * @see REMAINING_WORK_PLAN.md §5 O10.5
 * @see docs/strategy/build_button_execution_hookup plan
 */

import type { DispatchPayload } from "./claude-flow-client";

export interface BuildTaskOutput {
  /** Human-readable task description for the agent swarm */
  taskDescription: string;
  /** Structured context for programmatic consumption */
  context: {
    plannedFiles: Array<{ name: string; action: string; intent?: string }>;
    allowedPaths: string[];
    forbiddenPaths: string[];
    acceptanceCriteria: string[];
    memoryRefs: string[];
  };
}

const PROCESS_CHECK_SCRIPT = `
## Phase 1: PROCESS CHECK (MUST complete before any code)

You MUST complete this checklist before writing any implementation code. Do not skip any section.

### 1. RULES AUDIT
List all applicable mandatory rules for the current task from:
- Cursor AI Rules (repo_specific_rule)
- Mode-specific rules (mode_specific_rule)
- User rules (user_rules)

Format:
- [ ] Rule: [exact quote]
- [ ] Compliance: [how I will comply]

### 2. ARCHITECTURE AUDIT
Map data flows directly impacted by the current task after examining:
- Architecture docs in the context artifacts below
- Code files that are directly impacted by the current task

Format:
- For input/creation flows: [UI component] -> [Frontend service] -> [Next.js API] -> [Backend API] -> [Backend service] -> [Database fields]
- For retrieval flows: [UI component] -> [Frontend service] -> [Next.js API] -> [Backend API] -> [Database fields] -> [Backend service] -> ...
- For update/deletion flows: similar structure

### 3. REQUIREMENTS AUDIT
List all applicable requirements for the current task from the acceptance criteria below.

Format:
- [ ] Requirement: user can [outcome] by [action]
- [ ] Source: [Document name] OR [File name] OR [Code snippet] OR [exact quote]

### 4. UNCERTAINTY REGISTER
Populate this yourself by investigating the codebase and context artifacts:

**KNOWN**: [verified facts you discover]
**UNKNOWN**: [items needing investigation — investigate first, only block if unresolvable]
**ASSUMED**: [any assumptions you are making — BLOCKING if any remain unresolved after investigation]

**Status**: CLEAR / BLOCKED

### 5. TDD VERIFICATION
Tests required before implementation:
- If test context artifacts (type: 'test') are provided below, use them as the starting point
- List each test and its outcomes
- All tests must be written and failing before you write implementation code

**Can write code?**: NO (tests must be written first)

### 6. READINESS CHECKLIST
- [ ] Rules consulted and understood
- [ ] Architecture consulted and understood
- [ ] Requirements consulted and understood
- [ ] Uncertainty register clear
- [ ] Tests written covering all user outcomes and failing
- [ ] Ready for implementation

**PROCEED**: YES / NO

If NO, list blocking items. You MUST report back via webhook with event_type: 'execution_blocked' and include unresolved items in the knowledge payload. Do NOT implement.

If YES, proceed to Phase 2.
`;

const COMPLETION_VERIFICATION_SCRIPT = `
## Phase 3: COMPLETION VERIFICATION (MUST complete before reporting done)

You MUST complete this checklist before reporting execution_completed. Show evidence for each checkbox.

- [ ] All unit tests passing (show output)
- [ ] All integration tests passing (show output)
- [ ] All e2e tests passing (show output)
- [ ] No new linter errors (show output)
- [ ] No new type errors (show output)
- [ ] Uncertainty register resolved
- [ ] All acceptance criteria met (state criteria and show evidence per criterion)
- [ ] Basic CRUD operations verified by test (show output)
- [ ] Related product documentation identified and updated (if applicable)
- [ ] Answer "Would you bet your family's financial future on this?" with a yes and explain why
- [ ] Flow boundary preserved (Next.js API route remains FE boundary)
  - Evidence: file diffs showing changes only in app/api/** and/or server code
- [ ] No legacy table writes
  - Evidence: grep outputs show no .insert/.update/.delete on invitation_offers, booking_participants, external cache
- [ ] Timezone compliance
  - Evidence: new/changed records persist start_local, end_local, tzid; DB generating start_utc, end_utc
- [ ] Migrations path compliance
  - Evidence: only supabase/migrations/** changed (no Alembic)
- [ ] Stable endpoints unchanged or documented
  - Evidence: list endpoints touched vs doc anchors in #stable-endpoints
- [ ] Red-flag status and ADR (if any)
  - Evidence: ADR link + approval
- [ ] Boundary exceptions (if any) documented
  - Evidence: list files permitted to call backend directly and justification
- [ ] Test logging removed, replace with Sentry spans if required
  - Evidence: no secrets/PII logged; Sentry only in prod paths

**Ready for Production?**: YES / NO

**If NO, blocking items**:
- [List specific items that must be resolved before production]

Report your knowledge discoveries (facts found, assumptions made, questions raised) in the webhook knowledge field regardless of outcome.
`;

/**
 * Builds a task description from a dispatch payload.
 * Used by the claude-flow client to construct agent instructions.
 */
export function buildTaskFromPayload(payload: DispatchPayload): BuildTaskOutput {
  const allowedPaths = payload.allowed_paths ?? [];
  const forbiddenPaths = payload.forbidden_paths ?? [];
  const acceptanceCriteria = payload.acceptance_criteria ?? [];
  const memoryRefs = payload.memory_context_refs ?? [];
  const plannedFilesDetail = payload.planned_files_detail ?? [];
  const contextArtifacts = payload.context_artifacts ?? [];
  const cardTitle = payload.card_title ?? "Card";
  const cardDescription = payload.card_description ?? "";

  const plannedFiles = plannedFilesDetail.length > 0
    ? plannedFilesDetail.map((pf) => ({
        name: pf.logical_file_name,
        action: pf.action,
        intent: pf.intent_summary,
      }))
    : allowedPaths.map((name) => ({
        name,
        action: "create_or_edit",
        intent: undefined as string | undefined,
      }));

  const sections: string[] = [];

  // Phase 1: Process Check
  sections.push(`# Card: ${cardTitle}`);
  if (cardDescription) {
    sections.push(`Description: ${cardDescription}`);
  }
  sections.push(PROCESS_CHECK_SCRIPT);

  // Context artifacts (test files, docs, specs)
  if (contextArtifacts.length > 0) {
    sections.push(`## Context Artifacts (reference for process check and implementation)`);
    for (const art of contextArtifacts) {
      sections.push(`### ${art.name} (${art.type})${art.title ? ` — ${art.title}` : ""}`);
      sections.push(art.content ? `\`\`\`\n${art.content}\n\`\`\`` : "(no content)");
    }
  }

  // Phase 2: Implementation
  sections.push(`## Phase 2: IMPLEMENTATION`);

  sections.push(`Implement the card scope on branch \`${payload.feature_branch}\`.
${payload.worktree_path ? `Worktree: \`${payload.worktree_path}\`` : ""}`);

  if (plannedFilesDetail.length > 0) {
    sections.push(`## Planned files (with intent)`);
    for (const pf of plannedFilesDetail) {
      let line = `- \`${pf.logical_file_name}\` (${pf.action}, ${pf.artifact_kind}): ${pf.intent_summary}`;
      if (pf.contract_notes) line += `\n  Contract: ${pf.contract_notes}`;
      if (pf.module_hint) line += `\n  Module hint: ${pf.module_hint}`;
      sections.push(line);
    }
    sections.push(`Only modify files within the allowed paths above.`);
  } else if (allowedPaths.length > 0) {
    sections.push(`## Planned files
Create or edit these files:
${allowedPaths.map((p) => `- \`${p}\``).join("\n")}

Only modify files within the allowed paths above.`);
  }

  if (forbiddenPaths.length > 0) {
    sections.push(`## Forbidden paths
Do not modify:
${forbiddenPaths.map((p) => `- \`${p}\``).join("\n")}`);
  }

  if (acceptanceCriteria.length > 0) {
    sections.push(`## Acceptance criteria
${acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`);
  }

  if (memoryRefs.length > 0) {
    sections.push(`## Context references
Retrieved memory IDs for context: ${memoryRefs.join(", ")}`);
  }

  // Phase 3: Completion Verification
  sections.push(COMPLETION_VERIFICATION_SCRIPT);

  const taskDescription = sections.join("\n\n");

  return {
    taskDescription,
    context: {
      plannedFiles,
      allowedPaths,
      forbiddenPaths,
      acceptanceCriteria,
      memoryRefs,
    },
  };
}
