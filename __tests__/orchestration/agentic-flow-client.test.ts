/**
 * O10: Tests for agentic-flow client factory and real client.
 * - Factory throws when agentic-flow dependencies are missing
 * - Factory resolves ANTHROPIC_API_KEY from process.env or ~/.dossier/config
 * - Real client calls buildTaskFromPayload during dispatch
 *
 * CWD passthrough is verified by build-task.test.ts (worktree_path in task description)
 * and by manual/integration runs with a real agent.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createAgenticFlowClient,
  createRealAgenticFlowClient,
} from "@/lib/orchestration/agentic-flow-client";
import * as buildTask from "@/lib/orchestration/build-task";
import type { DispatchPayload } from "@/lib/orchestration/agentic-flow-client";

vi.mock("@/lib/config/data-dir", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/config/data-dir")>();
  return {
    ...original,
    readConfigFile: vi.fn(() => ({})),
  };
});

const basePayload: DispatchPayload = {
  run_id: "run-1",
  assignment_id: "assign-1",
  card_id: "card-1",
  feature_branch: "feat/test",
  allowed_paths: ["src/"],
  assignment_input_snapshot: {},
};

describe("createAgenticFlowClient factory (O10)", () => {
  it("throws when ANTHROPIC_API_KEY is missing from both env and config", () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => createAgenticFlowClient()).toThrow("agentic-flow not available");
      expect(() => createAgenticFlowClient()).toThrow("ANTHROPIC_API_KEY not set");
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});

describe("createRealAgenticFlowClient dispatch (O10)", () => {
  it("calls buildTaskFromPayload during dispatch", async () => {
    const buildSpy = vi.spyOn(buildTask, "buildTaskFromPayload").mockReturnValue({
      taskDescription: "Mock task from buildTaskFromPayload",
      context: {
        plannedFiles: [],
        allowedPaths: [],
        forbiddenPaths: [],
        acceptanceCriteria: [],
        memoryRefs: [],
      },
    });

    const client = createRealAgenticFlowClient();
    const payload: DispatchPayload = {
      ...basePayload,
      feature_branch: "feat/card-123",
      acceptance_criteria: ["Criterion A"],
    };

    await client.dispatch(payload);

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledWith(payload);

    buildSpy.mockRestore();
  });
});
