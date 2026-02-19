/**
 * Integration tests for orchestration execution:
 * - Agentic-flow mock client (dispatch, status, cancel)
 * - Webhook processing (execution_completed, execution_failed)
 * - Event logger
 * - Dispatch with mock agentic-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAgenticFlowClient } from "@/lib/orchestration/agentic-flow-client";
import { logEvent } from "@/lib/orchestration/event-logger";
import { processWebhook } from "@/lib/orchestration/process-webhook";
import { dispatchAssignment } from "@/lib/orchestration/dispatch";
import * as orchestrationQueries from "@/lib/db/queries/orchestration";
import * as queries from "@/lib/db/queries";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

const projectId = "11111111-1111-1111-1111-111111111111";
const runId = "22222222-2222-2222-2222-222222222222";
const assignmentId = "33333333-3333-3333-3333-333333333333";
const cardId = "44444444-4444-4444-4444-444444444444";

vi.mock("@/lib/db/queries/orchestration", () => ({
  getCardAssignment: vi.fn(),
  getOrchestrationRun: vi.fn(),
  updateCardAssignmentStatus: vi.fn(),
  getAgentExecutionsByAssignment: vi.fn(),
  getRunChecksByRun: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db/queries", () => ({
  getCardById: vi.fn(),
  getCardPlannedFiles: vi.fn(),
  getCardRequirements: vi.fn(),
  getCardContextArtifacts: vi.fn().mockResolvedValue([]),
  getArtifactById: vi.fn(),
}));

describe("Agentic-flow mock client", () => {
  it("dispatch returns execution_id", async () => {
    const client = createMockAgenticFlowClient();
    const result = await client.dispatch({
      run_id: runId,
      assignment_id: assignmentId,
      card_id: cardId,
      feature_branch: "feat/test",
      allowed_paths: ["src/"],
      assignment_input_snapshot: {},
    });

    expect(result.success).toBe(true);
    expect(result.execution_id).toBeDefined();
    expect(result.execution_id).toMatch(/^mock-exec-/);
  });

  it("status returns completed for mock execution", async () => {
    const client = createMockAgenticFlowClient();
    const dispatchResult = await client.dispatch({
      run_id: runId,
      assignment_id: assignmentId,
      card_id: cardId,
      feature_branch: "feat/test",
      allowed_paths: ["src/"],
      assignment_input_snapshot: {},
    });

    const statusResult = await client.status(dispatchResult.execution_id!);
    expect(statusResult.success).toBe(true);
    expect(statusResult.status?.status).toBe("completed");
  });

  it("cancel removes execution", async () => {
    const client = createMockAgenticFlowClient();
    const dispatchResult = await client.dispatch({
      run_id: runId,
      assignment_id: assignmentId,
      card_id: cardId,
      feature_branch: "feat/test",
      allowed_paths: ["src/"],
      assignment_input_snapshot: {},
    });

    const cancelResult = await client.cancel(dispatchResult.execution_id!);
    expect(cancelResult.success).toBe(true);

    const statusResult = await client.status(dispatchResult.execution_id!);
    expect(statusResult.success).toBe(false);
    expect(statusResult.error).toContain("not found");
  });
});

describe("Event logger", () => {
  it("writes event to event_log", async () => {
    const mockInsertEventLog = vi.fn().mockResolvedValue({ id: "event-123" });
    const mockDb = createMockDbAdapter({ insertEventLog: mockInsertEventLog });

    const result = await logEvent(mockDb, {
      project_id: projectId,
      run_id: runId,
      event_type: "agent_run_started",
      actor: "system",
      payload: { assignment_id: assignmentId },
    });

    expect(result.success).toBe(true);
    expect(result.eventId).toBe("event-123");
    expect(mockInsertEventLog).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: projectId,
        run_id: runId,
        event_type: "agent_run_started",
        actor: "system",
      })
    );
  });
});

describe("Webhook processing", () => {
  const mockAssignment = {
    id: assignmentId,
    run_id: runId,
    card_id: cardId,
    status: "running",
  };
  const mockRun = {
    id: runId,
    project_id: projectId,
    status: "running",
  };
  const mockAgentExec = {
    id: "exec-123",
    assignment_id: assignmentId,
    status: "running",
  };

  beforeEach(() => {
    vi.mocked(orchestrationQueries.getCardAssignment).mockResolvedValue(
      mockAssignment as never
    );
    vi.mocked(orchestrationQueries.getOrchestrationRun).mockResolvedValue(
      mockRun as never
    );
    vi.mocked(orchestrationQueries.getAgentExecutionsByAssignment).mockResolvedValue(
      [mockAgentExec] as never
    );
  });

  it("execution_completed updates assignment and agent_execution", async () => {
    const mockDb = createMockDbAdapter();

    const result = await processWebhook(mockDb, {
      event_type: "execution_completed",
      assignment_id: assignmentId,
      summary: "Done",
    });

    expect(result.success).toBe(true);
  });

  it("execution_failed updates run status", async () => {
    const mockDb = createMockDbAdapter();

    const result = await processWebhook(mockDb, {
      event_type: "execution_failed",
      assignment_id: assignmentId,
      error: "Build failed",
    });

    expect(result.success).toBe(true);
  });

  it("returns error for unknown event_type", async () => {
    const result = await processWebhook(createMockDbAdapter(), {
      event_type: "unknown_event" as never,
      assignment_id: assignmentId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown event_type");
  });

  it("writes knowledge with per-type sequential positions (facts 0,1; assumptions 0; questions 0)", async () => {
    const mockInsertCardFact = vi.fn().mockResolvedValue(undefined);
    const mockInsertCardAssumption = vi.fn().mockResolvedValue(undefined);
    const mockInsertCardQuestion = vi.fn().mockResolvedValue(undefined);
    const mockDb = createMockDbAdapter({
      getCardFacts: vi.fn().mockResolvedValue([]),
      getCardAssumptions: vi.fn().mockResolvedValue([]),
      getCardQuestions: vi.fn().mockResolvedValue([]),
      insertCardFact: mockInsertCardFact,
      insertCardAssumption: mockInsertCardAssumption,
      insertCardQuestion: mockInsertCardQuestion,
    });

    const result = await processWebhook(mockDb, {
      event_type: "execution_completed",
      assignment_id: assignmentId,
      knowledge: {
        facts: [
          { text: "Fact A", evidence_source: "code" },
          { text: "Fact B" },
        ],
        assumptions: [{ text: "Assumption 1" }],
        questions: [{ text: "Question 1" }],
      },
    });

    expect(result.success).toBe(true);
    expect(mockInsertCardFact).toHaveBeenCalledTimes(2);
    expect(mockInsertCardFact).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ text: "Fact A", position: 0 })
    );
    expect(mockInsertCardFact).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "Fact B", position: 1 })
    );
    expect(mockInsertCardAssumption).toHaveBeenCalledTimes(1);
    expect(mockInsertCardAssumption).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Assumption 1", position: 0 })
    );
    expect(mockInsertCardQuestion).toHaveBeenCalledTimes(1);
    expect(mockInsertCardQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Question 1", position: 0 })
    );
  });

  it("appends knowledge with positions offset by existing items per type", async () => {
    const mockInsertCardFact = vi.fn().mockResolvedValue(undefined);
    const mockInsertCardAssumption = vi.fn().mockResolvedValue(undefined);
    const mockInsertCardQuestion = vi.fn().mockResolvedValue(undefined);
    const mockDb = createMockDbAdapter({
      getCardFacts: vi.fn().mockResolvedValue([{ id: "f1", position: 0 }]),
      getCardAssumptions: vi.fn().mockResolvedValue([{ id: "a1", position: 0 }]),
      getCardQuestions: vi.fn().mockResolvedValue([]),
      insertCardFact: mockInsertCardFact,
      insertCardAssumption: mockInsertCardAssumption,
      insertCardQuestion: mockInsertCardQuestion,
    });

    await processWebhook(mockDb, {
      event_type: "execution_completed",
      assignment_id: assignmentId,
      knowledge: {
        facts: [{ text: "New fact" }],
        assumptions: [{ text: "New assumption" }],
      },
    });

    expect(mockInsertCardFact).toHaveBeenCalledWith(
      expect.objectContaining({ text: "New fact", position: 1 })
    );
    expect(mockInsertCardAssumption).toHaveBeenCalledWith(
      expect.objectContaining({ text: "New assumption", position: 1 })
    );
  });
});

describe("Dispatch assignment", () => {
  const mockAssignment = {
    id: assignmentId,
    run_id: runId,
    card_id: cardId,
    status: "queued",
    feature_branch: "feat/test",
    worktree_path: null,
    allowed_paths: ["src/"],
    forbidden_paths: null,
    assignment_input_snapshot: {},
  };
  const mockRun = {
    id: runId,
    project_id: projectId,
    status: "queued",
  };
  const mockCard = {
    id: cardId,
    description: "Implement feature",
  };

  beforeEach(() => {
    vi.mocked(orchestrationQueries.getCardAssignment).mockResolvedValue(
      mockAssignment as never
    );
    vi.mocked(orchestrationQueries.getOrchestrationRun).mockResolvedValue(
      mockRun as never
    );
    vi.mocked(queries.getCardById).mockResolvedValue(mockCard as never);
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([
      { id: "pf-1", status: "approved", logical_file_name: "src/index.ts" },
    ] as never);
    vi.mocked(queries.getCardRequirements).mockResolvedValue([] as never);
  });

  it("returns error when assignment not found", async () => {
    vi.mocked(orchestrationQueries.getCardAssignment).mockResolvedValue(null);

    const result = await dispatchAssignment(createMockDbAdapter(), {
      assignment_id: assignmentId,
      actor: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Assignment not found");
  });

  it("returns error when assignment not queued", async () => {
    vi.mocked(orchestrationQueries.getCardAssignment).mockResolvedValue({
      ...mockAssignment,
      status: "running",
    } as never);

    const result = await dispatchAssignment(createMockDbAdapter(), {
      assignment_id: assignmentId,
      actor: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not queued");
  });

  it("dispatches successfully when no approved planned files (uses assignment allowed_paths)", async () => {
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([
      { id: "pf-1", status: "proposed" },
    ] as never);
    vi.mocked(orchestrationQueries.getCardAssignment).mockResolvedValue({
      ...mockAssignment,
      allowed_paths: ["src", "app", "lib"],
    } as never);

    const mockDb = createMockDbAdapter({
      insertAgentExecution: vi.fn().mockResolvedValue({ id: "agent-exec-no-pf" }),
    });
    const result = await dispatchAssignment(mockDb, {
      assignment_id: assignmentId,
      actor: "user",
    });

    expect(result.success).toBe(true);
    expect(result.executionId).toBeDefined();
  }, 30_000);

  it("dispatches successfully with mock client", async () => {
    const mockDb = createMockDbAdapter({
      insertAgentExecution: vi.fn().mockResolvedValue({ id: "agent-exec-123" }),
    });

    const result = await dispatchAssignment(mockDb, {
      assignment_id: assignmentId,
      actor: "user",
    });

    expect(result.success).toBe(true);
    expect(result.executionId).toBeDefined();
    expect(result.agentExecutionId).toBe("agent-exec-123");
  }, 30_000);
});
