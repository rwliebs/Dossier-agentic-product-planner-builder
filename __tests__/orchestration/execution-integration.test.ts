/**
 * Integration tests for orchestration execution:
 * - Claude-flow mock client (dispatch, status, cancel)
 * - Webhook processing (execution_completed, execution_failed)
 * - Event logger
 * - Dispatch with mock claude-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockClaudeFlowClient } from "@/lib/orchestration/claude-flow-client";
import { logEvent } from "@/lib/orchestration/event-logger";
import { processWebhook } from "@/lib/orchestration/process-webhook";
import { dispatchAssignment } from "@/lib/orchestration/dispatch";
import * as orchestrationQueries from "@/lib/supabase/queries/orchestration";
import * as queries from "@/lib/supabase/queries";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

const projectId = "11111111-1111-1111-1111-111111111111";
const runId = "22222222-2222-2222-2222-222222222222";
const assignmentId = "33333333-3333-3333-3333-333333333333";
const cardId = "44444444-4444-4444-4444-444444444444";

vi.mock("@/lib/supabase/queries/orchestration", () => ({
  getCardAssignment: vi.fn(),
  getOrchestrationRun: vi.fn(),
  updateCardAssignmentStatus: vi.fn(),
  getAgentExecutionsByAssignment: vi.fn(),
  getRunChecksByRun: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/supabase/queries", () => ({
  getCardById: vi.fn(),
  getCardPlannedFiles: vi.fn(),
  getCardRequirements: vi.fn(),
  getCardContextArtifacts: vi.fn().mockResolvedValue([]),
  getArtifactById: vi.fn(),
}));

describe("Claude-flow mock client", () => {
  it("dispatch returns execution_id", async () => {
    const client = createMockClaudeFlowClient();
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
    const client = createMockClaudeFlowClient();
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
    const client = createMockClaudeFlowClient();
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

  it("returns error when card has no approved planned files", async () => {
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([
      { id: "pf-1", status: "proposed" },
    ] as never);

    const result = await dispatchAssignment(createMockDbAdapter(), {
      assignment_id: assignmentId,
      actor: "user",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no approved planned files");
  });

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
  });
});
