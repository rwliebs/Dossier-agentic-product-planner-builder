/**
 * O9: Tests for task description builder (O10.5).
 */

import { describe, it, expect } from "vitest";
import { buildTaskFromPayload } from "@/lib/orchestration/build-task";
import type { DispatchPayload } from "@/lib/orchestration/claude-flow-client";

describe("Build task from payload (O10.5)", () => {
  it("builds task description with planned files and acceptance criteria", () => {
    const payload: DispatchPayload = {
      run_id: "run-1",
      assignment_id: "assign-1",
      card_id: "card-1",
      feature_branch: "feat/run-123-card-1",
      worktree_path: null,
      allowed_paths: ["src/component.tsx", "src/hook.ts"],
      forbidden_paths: ["src/legacy/"],
      assignment_input_snapshot: {},
      acceptance_criteria: ["User can click button", "Form validates input"],
    };

    const result = buildTaskFromPayload(payload);

    expect(result.taskDescription).toContain("feat/run-123-card-1");
    expect(result.taskDescription).toContain("src/component.tsx");
    expect(result.taskDescription).toContain("src/hook.ts");
    expect(result.taskDescription).toContain("src/legacy/");
    expect(result.taskDescription).toContain("User can click button");
    expect(result.taskDescription).toContain("Form validates input");

    expect(result.context.plannedFiles).toHaveLength(2);
    expect(result.context.allowedPaths).toEqual(["src/component.tsx", "src/hook.ts"]);
    expect(result.context.forbiddenPaths).toEqual(["src/legacy/"]);
    expect(result.context.acceptanceCriteria).toEqual([
      "User can click button",
      "Form validates input",
    ]);
  });

  it("includes memory refs when present", () => {
    const payload: DispatchPayload = {
      run_id: "run-1",
      assignment_id: "assign-1",
      card_id: "card-1",
      feature_branch: "feat/test",
      allowed_paths: [],
      assignment_input_snapshot: {},
      memory_context_refs: ["mem-1", "mem-2"],
    };

    const result = buildTaskFromPayload(payload);

    expect(result.taskDescription).toContain("mem-1");
    expect(result.taskDescription).toContain("mem-2");
    expect(result.context.memoryRefs).toEqual(["mem-1", "mem-2"]);
  });
});
