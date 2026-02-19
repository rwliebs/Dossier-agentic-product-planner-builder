/**
 * O9: Integration tests for trigger-build.
 * - Single-build lock (O10.6)
 * - Full trigger flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { triggerBuild } from "@/lib/orchestration/trigger-build";
import * as orchestrationQueries from "@/lib/supabase/queries/orchestration";
import * as queries from "@/lib/supabase/queries";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

const projectId = "11111111-1111-1111-1111-111111111111";
const workflowId = "22222222-2222-2222-2222-222222222222";
const cardId = "33333333-3333-3333-3333-333333333333";

const mockPolicy = {
  id: "policy-1",
  project_id: projectId,
  required_checks: ["lint"],
  protected_paths: [],
  forbidden_paths: [],
  dependency_policy: {},
  security_policy: {},
  architecture_policy: {},
  approval_policy: {},
  updated_at: new Date().toISOString(),
};

vi.mock("@/lib/supabase/queries/orchestration", () => ({
  listOrchestrationRunsByProject: vi.fn(),
  getSystemPolicyProfileByProject: vi.fn(),
  getCardAssignment: vi.fn(),
  getOrchestrationRun: vi.fn(),
  getCardAssignmentsByRun: vi.fn(),
  updateCardAssignmentStatus: vi.fn(),
  getAgentExecutionsByAssignment: vi.fn(),
  getRunChecksByRun: vi.fn(),
}));

vi.mock("@/lib/supabase/queries", () => ({
  getProject: vi.fn(),
  getCardIdsByWorkflow: vi.fn(),
  getCardPlannedFiles: vi.fn(),
  getCardById: vi.fn(),
  getCardRequirements: vi.fn(),
  getCardContextArtifacts: vi.fn().mockResolvedValue([]),
  getArtifactById: vi.fn(),
}));

describe("Trigger build - single-build lock (O10.6)", () => {
  beforeEach(() => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(orchestrationQueries.getSystemPolicyProfileByProject).mockResolvedValue(
      mockPolicy as never
    );
    vi.mocked(queries.getProject).mockResolvedValue({
      id: projectId,
      repo_url: "https://github.com/test/repo",
      default_branch: "main",
    } as never);
    vi.mocked(queries.getCardIdsByWorkflow).mockResolvedValue([cardId]);
    vi.mocked(queries.getCardById).mockResolvedValue({
      id: cardId,
      finalized_at: new Date().toISOString(),
    } as never);
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([
      { id: "pf-1", status: "approved", logical_file_name: "src/index.ts" },
    ] as never);
  });

  it("rejects when a build is already running", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([
      { id: "run-1", project_id: projectId, status: "running" },
    ] as never);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Build in progress");
    expect(result.validationErrors).toContain(
      "A build is already running for this project. Wait for it to complete."
    );
  });

  it("does not reject with build-in-progress when no run is running", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "workflow",
      workflow_id: workflowId,
      trigger_type: "workflow",
      initiated_by: "user",
    });

    // Lock check passes: we should not get "Build in progress"
    expect(result.error).not.toBe("Build in progress");
    expect(result.validationErrors).not.toContain(
      "A build is already running for this project. Wait for it to complete."
    );
  });

  it("rejects when card(s) lack finalized_at", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(queries.getCardById).mockResolvedValue({
      id: cardId,
      finalized_at: null,
    } as never);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "card",
      card_id: cardId,
      trigger_type: "card",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Card(s) not finalized");
    expect(result.validationErrors).toContain(
      "Build requires finalized cards. Finalize each card (review context and confirm) before triggering build."
    );
  });

  it("rejects when card(s) have no approved planned files", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue([]);
    vi.mocked(queries.getCardById).mockResolvedValue({
      id: cardId,
      finalized_at: new Date().toISOString(),
    } as never);
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([]);

    const mockDb = createMockDbAdapter();
    const result = await triggerBuild(mockDb, {
      project_id: projectId,
      scope: "card",
      card_id: cardId,
      trigger_type: "card",
      initiated_by: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No buildable cards");
    expect(result.validationErrors).toContain(
      "Build requires at least one card with approved planned files. Approve planned files for each card before triggering build."
    );
  });
});
