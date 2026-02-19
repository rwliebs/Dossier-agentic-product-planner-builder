/**
 * O10: Tests for local agentic-flow client factory and real client.
 * - Factory returns mock when agentic-flow is not available
 * - Factory returns real client when agentic-flow IS available (via test override)
 * - buildTaskFromPayload is called during real dispatch
 * - No real Anthropic API key required
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAgenticFlowClient,
  createRealAgenticFlowClient,
  __setRealClientAvailableForTesting,
} from "@/lib/orchestration/agentic-flow-client";
import * as buildTask from "@/lib/orchestration/build-task";
import type { DispatchPayload } from "@/lib/orchestration/agentic-flow-client";

vi.mock("node:child_process", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("node:child_process")>();
  const mockSpawn = vi.fn(() => ({
    pid: 99999,
    unref: vi.fn(),
    on: vi.fn(),
  }));
  return {
    ...mod,
    default: { ...mod, spawn: mockSpawn },
    spawn: mockSpawn,
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
  beforeEach(() => {
    __setRealClientAvailableForTesting(null);
  });

  it("returns mock when agentic-flow is not available", async () => {
    __setRealClientAvailableForTesting(false);
    const client = createAgenticFlowClient();
    const result = await client.dispatch(basePayload);

    expect(result.success).toBe(true);
    expect(result.execution_id).toBeDefined();
    expect(result.execution_id).toMatch(/^mock-exec-/);
  });

  it("returns real client when agentic-flow is available", async () => {
    __setRealClientAvailableForTesting(true);
    const client = createAgenticFlowClient();
    const result = await client.dispatch(basePayload);

    expect(result.success).toBe(true);
    expect(result.execution_id).toBeDefined();
    expect(result.execution_id).not.toMatch(/^mock-exec-/);
    expect(result.execution_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
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
