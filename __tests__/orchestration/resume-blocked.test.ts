import { describe, it, expect, vi, beforeEach } from "vitest";
import { resumeBlockedAssignment } from "@/lib/orchestration/resume-blocked";
import { dispatchAssignment } from "@/lib/orchestration/dispatch";
import * as orchestrationQueries from "@/lib/db/queries/orchestration";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

vi.mock("@/lib/orchestration/dispatch", () => ({
  dispatchAssignment: vi.fn(),
}));

vi.mock("@/lib/db/queries/orchestration", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/db/queries/orchestration")>();
  return {
    ...mod,
    listOrchestrationRunsByProject: vi.fn(),
    getCardAssignmentsByRun: vi.fn(),
  };
});

const mockRuns = [{ id: "run-1", project_id: "proj-1", status: "running" }];
const mockAssignments = [
  { id: "assign-1", run_id: "run-1", card_id: "card-1", status: "blocked" },
];

describe("resumeBlockedAssignment", () => {
  const mockUpdateCardAssignment = vi.fn().mockResolvedValue(undefined);
  const mockUpdateCard = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue(
      mockRuns as never
    );
    vi.mocked(orchestrationQueries.getCardAssignmentsByRun).mockResolvedValue(
      mockAssignments as never
    );
  });

  it("returns error when no blocked assignment found for card", async () => {
    vi.mocked(orchestrationQueries.listOrchestrationRunsByProject).mockResolvedValue(
      [] as never
    );

    const db = createMockDbAdapter({
      updateCardAssignment: mockUpdateCardAssignment,
      updateCard: mockUpdateCard,
    });

    const result = await resumeBlockedAssignment(db, {
      project_id: "proj-1",
      card_id: "card-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No blocked assignment");
    expect(dispatchAssignment).not.toHaveBeenCalled();
  });

  it("requeues and dispatches when blocked assignment exists", async () => {
    vi.mocked(dispatchAssignment).mockResolvedValue({
      success: true,
      executionId: "exec-1",
      agentExecutionId: "agent-exec-1",
    });

    const db = createMockDbAdapter({
      updateCardAssignment: mockUpdateCardAssignment,
      updateCard: mockUpdateCard,
    });

    const result = await resumeBlockedAssignment(db, {
      project_id: "proj-1",
      card_id: "card-1",
    });

    expect(result.success).toBe(true);
    expect(result.assignmentId).toBe("assign-1");
    expect(result.runId).toBe("run-1");
    expect(mockUpdateCardAssignment).toHaveBeenCalledWith("assign-1", {
      status: "queued",
    });
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", {
      build_state: "queued",
    });
    expect(dispatchAssignment).toHaveBeenCalledWith(db, {
      assignment_id: "assign-1",
      actor: "user",
    });
  });

  it("reverts to blocked when dispatch fails", async () => {
    vi.mocked(dispatchAssignment).mockResolvedValue({
      success: false,
      error: "Dispatch failed",
    });

    const db = createMockDbAdapter({
      updateCardAssignment: mockUpdateCardAssignment,
      updateCard: mockUpdateCard,
    });

    const result = await resumeBlockedAssignment(db, {
      project_id: "proj-1",
      card_id: "card-1",
    });

    expect(result.success).toBe(false);
    expect(mockUpdateCardAssignment).toHaveBeenNthCalledWith(1, "assign-1", {
      status: "queued",
    });
    expect(mockUpdateCardAssignment).toHaveBeenNthCalledWith(2, "assign-1", {
      status: "blocked",
    });
    expect(mockUpdateCard).toHaveBeenLastCalledWith("card-1", {
      build_state: "blocked",
    });
  });
});
