/**
 * O10.5: Task description builder.
 * Translates DispatchPayload into claude-flow task description with planned files,
 * constraints, acceptance criteria, and swarm agent workflow instructions.
 *
 * @see REMAINING_WORK_PLAN.md §5 O10.5
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

/**
 * Builds a task description from a dispatch payload.
 * Used by the claude-flow client to construct agent instructions.
 */
export function buildTaskFromPayload(payload: DispatchPayload): BuildTaskOutput {
  const allowedPaths = payload.allowed_paths ?? [];
  const forbiddenPaths = payload.forbidden_paths ?? [];
  const acceptanceCriteria = payload.acceptance_criteria ?? [];
  const memoryRefs = payload.memory_context_refs ?? [];

  const plannedFiles = allowedPaths.map((name) => ({
    name,
    action: "create_or_edit",
    intent: undefined,
  }));

  const sections: string[] = [];

  sections.push(`## Task
Implement the card scope on branch \`${payload.feature_branch}\`.
${payload.worktree_path ? `Worktree: \`${payload.worktree_path}\`` : ""}`);

  if (allowedPaths.length > 0) {
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
