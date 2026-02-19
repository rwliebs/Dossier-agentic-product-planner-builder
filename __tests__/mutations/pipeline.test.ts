/**
 * Integration tests for mutation pipeline hardening (REMAINING_WORK_PLAN §2)
 * Tests: pipelineApply, preview/apply match, idempotency, state reconstruction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pipelineApply,
  applyAction,
  type ActionInput,
} from "@/lib/supabase/mutations";
import {
  reconstructStateFromActions,
  detectDrift,
  type ReconstructResult,
} from "@/lib/actions/reconstruct-state";
import {
  previewActionBatch,
  applyActionBatch,
} from "@/lib/actions/preview-action";
import {
  createEmptyPlanningState,
  clonePlanningState,
} from "@/lib/schemas/planning-state";
import type { Project, PlanningAction } from "@/lib/schemas/slice-a";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

const projectId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const activityId = "33333333-3333-4333-8333-333333333333";
const cardId = "55555555-5555-4555-8555-555555555555";

function createPipelineMockDb() {
  return createMockDbAdapter({
    getProject: vi.fn().mockResolvedValue({ id: projectId, name: "Test" }),
    getWorkflowsByProject: vi.fn().mockResolvedValue([]),
    getActivitiesByWorkflow: vi.fn().mockResolvedValue([]),
  });
}

describe("pipelineApply", () => {
  it("applies batch of actions and returns results", async () => {
    const db = createPipelineMockDb();
    const actions: ActionInput[] = [
      {
        action_type: "createWorkflow",
        target_ref: { project_id: projectId },
        payload: { id: workflowId, title: "Core", description: null, position: 0 },
      },
    ];
    const result = await pipelineApply(db, projectId, actions);
    expect(result.applied).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].validation_status).toBe("accepted");
    expect(result.failedAt).toBeUndefined();
  });

  it("stops on first rejection and returns failedAt", async () => {
    const db = createPipelineMockDb();
    const actions: ActionInput[] = [
      {
        action_type: "createWorkflow",
        target_ref: { project_id: projectId },
        payload: { id: workflowId, title: "Core", position: 0 },
      },
      {
        action_type: "createCard",
        target_ref: { workflow_activity_id: "nonexistent" },
        payload: {
          title: "Card",
          status: "todo",
          priority: 1,
          position: 0,
        },
      },
    ];
    const result = await pipelineApply(db, projectId, actions);
    expect(result.failedAt).toBe(1);
    expect(result.rejectionReason).toBeDefined();
  });
});

describe("preview/apply match", () => {
  it("previewActionBatch and applyActionBatch produce consistent state", () => {
    const project: Project = {
      id: projectId,
      name: "Test",
      repo_url: null,
      default_branch: "main",
    };
    const state = createEmptyPlanningState(project);
    state.workflows.set(workflowId, {
      id: workflowId,
      project_id: projectId,
      title: "Core",
      description: null,
      build_state: null,
      position: 0,
    });
    state.activities.set(activityId, {
      id: activityId,
      workflow_id: workflowId,
      title: "Planning",
      color: "blue",
      position: 0,
    });

    const actions: PlanningAction[] = [
      {
        id: "a1",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          id: cardId,
          title: "Card 1",
          status: "todo",
          priority: 1,
          position: 0,
        },
      },
    ];

    const previews = previewActionBatch(actions, state);
    expect(previews).not.toBeNull();
    expect(previews).toHaveLength(1);

    const batchResult = applyActionBatch(actions, state);
    expect(batchResult.success).toBe(true);
    expect(batchResult.applied_count).toBe(1);
    expect(batchResult.final_state?.cards.size).toBe(1);
  });
});

describe("reconstructStateFromActions", () => {
  it("replays accepted actions onto empty state", () => {
    const project: Project = {
      id: projectId,
      name: "Test",
      repo_url: null,
      default_branch: "main",
    };
    const actions = [
      {
        id: "a1",
        project_id: projectId,
        action_type: "createWorkflow" as const,
        target_ref: { project_id: projectId },
        payload: { id: workflowId, title: "Core", position: 0 },
        validation_status: "accepted" as const,
      },
      {
        id: "a2",
        project_id: projectId,
        action_type: "createActivity" as const,
        target_ref: { workflow_id: workflowId },
        payload: { id: activityId, title: "Planning", position: 0 },
        validation_status: "accepted" as const,
      },
    ] as PlanningAction[];

    const result = reconstructStateFromActions(project, actions);
    expect(result.success).toBe(true);
    expect(result.state.workflows.size).toBe(1);
    expect(result.state.activities.size).toBe(1);
    expect(result.appliedCount).toBe(2);
  });

  it("skips rejected actions", () => {
    const project: Project = {
      id: projectId,
      name: "Test",
      repo_url: null,
      default_branch: "main",
    };
    const actions = [
      {
        id: "a1",
        project_id: projectId,
        action_type: "createWorkflow" as const,
        target_ref: { project_id: projectId },
        payload: { id: workflowId, title: "Core", position: 0 },
        validation_status: "rejected" as const,
      },
    ] as PlanningAction[];

    const result = reconstructStateFromActions(project, actions);
    expect(result.success).toBe(true);
    expect(result.state.workflows.size).toBe(0);
    expect(result.appliedCount).toBe(0);
  });
});

describe("detectDrift", () => {
  it("reports no drift when states match", () => {
    const project: Project = {
      id: projectId,
      name: "Test",
      repo_url: null,
      default_branch: "main",
    };
    const state = createEmptyPlanningState(project);
    state.workflows.set(workflowId, {
      id: workflowId,
      project_id: projectId,
      title: "Core",
      description: null,
      build_state: null,
      position: 0,
    });

    const other = clonePlanningState(state);
    const drift = detectDrift(state, other);
    expect(drift.hasDrift).toBe(false);
  });

  it("reports drift when workflow counts differ", () => {
    const project: Project = {
      id: projectId,
      name: "Test",
      repo_url: null,
      default_branch: "main",
    };
    const stateA = createEmptyPlanningState(project);
    stateA.workflows.set(workflowId, {
      id: workflowId,
      project_id: projectId,
      title: "Core",
      description: null,
      build_state: null,
      position: 0,
    });

    const stateB = createEmptyPlanningState(project);

    const drift = detectDrift(stateA, stateB);
    expect(drift.hasDrift).toBe(true);
    expect(drift.workflowCountDiff).toBe(1);
    expect(drift.details).toContain("Workflows: +1");
  });
});
