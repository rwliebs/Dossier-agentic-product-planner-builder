import {
  validateAction,
  validateActionBatch,
  validateActionSchema,
  validateReferentialIntegrity,
  validatePolicies,
} from "@/lib/actions/validate-action";
import {
  createEmptyPlanningState,
  cardExists,
} from "@/lib/schemas/planning-state";
import type { Project, PlanningAction } from "@/lib/schemas/slice-a";

describe("Action Validation", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const workflowId = "22222222-2222-4222-8222-222222222222";
  const activityId = "33333333-3333-4333-8333-333333333333";
  const stepId = "44444444-4444-4444-8444-444444444444";
  const cardId = "55555555-5555-4555-8555-555555555555";

  let project: Project;

  beforeEach(() => {
    project = {
      id: projectId,
      name: "Test Project",
      repo_url: "https://github.com/test/project",
      default_branch: "main",
    };
  });

  describe("Schema Validation", () => {
    it("accepts valid createWorkflow action", () => {
      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createWorkflow",
        target_ref: { project_id: projectId },
        payload: {
          title: "Core Development",
          position: 0,
        },
      };

      const errors = validateActionSchema(action);
      expect(errors).toHaveLength(0);
    });

    it("rejects action with invalid UUID", () => {
      const action: PlanningAction = {
        id: "not-a-uuid",
        project_id: projectId,
        action_type: "createWorkflow",
        target_ref: { project_id: projectId },
        payload: { title: "Test", position: 0 },
      };

      const errors = validateActionSchema(action);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("invalid_schema");
    });

    it("rejects action with empty title", () => {
      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createWorkflow",
        target_ref: { project_id: projectId },
        payload: {
          title: "",
          position: 0,
        },
      };

      const errors = validateActionSchema(action);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("invalid_schema");
    });

    it("rejects updateCard with null title, status, or priority", () => {
      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "updateCard",
        target_ref: { card_id: cardId },
        payload: {
          title: null,
          status: null,
          priority: null,
        },
      };

      const errors = validateActionSchema(action);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("invalid_schema");
    });
  });

  describe("Referential Integrity", () => {
    it("rejects createActivity without existing workflow", () => {
      const state = createEmptyPlanningState(project);

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createActivity",
        target_ref: { workflow_id: workflowId },
        payload: {
          title: "Planning",
          position: 0,
        },
      };

      const errors = validateReferentialIntegrity(action, state);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("referential_integrity");
    });

    it("accepts createActivity with existing workflow", () => {
      const state = createEmptyPlanningState(project);

      // Add workflow
      state.workflows.set(workflowId, {
        id: workflowId,
        project_id: projectId,
        title: "Core",
        position: 0,
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createActivity",
        target_ref: { workflow_id: workflowId },
        payload: {
          title: "Planning",
          position: 0,
        },
      };

      const errors = validateReferentialIntegrity(action, state);
      expect(errors).toHaveLength(0);
    });

    it("rejects updateCard without existing card", () => {
      const state = createEmptyPlanningState(project);

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "updateCard",
        target_ref: { card_id: cardId },
        payload: {
          title: "Updated Title",
        },
      };

      const errors = validateReferentialIntegrity(action, state);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("referential_integrity");
    });

    it("accepts linkContextArtifact with existing card and artifact", () => {
      const state = createEmptyPlanningState(project);
      const artifactId = "66666666-6666-4666-8666-666666666666";

      // Add card and artifact
      state.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "Test Card",
        status: "todo",
        priority: 1,
        position: 0,
      });

      state.contextArtifacts.set(artifactId, {
        id: artifactId,
        project_id: projectId,
        name: "API Spec",
        type: "doc",
        content: "API endpoint documentation",
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "linkContextArtifact",
        target_ref: { card_id: cardId },
        payload: {
          context_artifact_id: artifactId,
          usage_hint: "Reference implementation",
        },
      };

      const errors = validateReferentialIntegrity(action, state);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Policy Validation", () => {
    it("rejects action with code generation intent", () => {
      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Generate React component",
          description:
            "Generate code for authentication component with OAuth",
          status: "todo",
          priority: 1,
          position: 0,
        },
      };

      const errors = validatePolicies(action);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("code_generation_detected");
    });

    it("accepts action without code generation intent", () => {
      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Implement user authentication",
          description: "Add OAuth integration with Google",
          status: "todo",
          priority: 1,
          position: 0,
        },
      };

      const errors = validatePolicies(action);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Full Validation", () => {
    it("returns all validation errors aggregated", () => {
      const state = createEmptyPlanningState(project);

      // Action with invalid schema AND missing reference
      const action: PlanningAction = {
        id: "not-uuid",
        project_id: projectId,
        action_type: "createActivity",
        target_ref: { workflow_id: "also-not-uuid" },
        payload: { title: "", position: 0 },
      };

      const result = validateAction(action, state);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("validates batch of actions", () => {
      const state = createEmptyPlanningState(project);

      const actions: PlanningAction[] = [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          project_id: projectId,
          action_type: "createWorkflow",
          target_ref: { project_id: projectId },
          payload: { title: "Core", position: 0 },
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          project_id: projectId,
          action_type: "createActivity",
          target_ref: { workflow_id: workflowId }, // doesn't exist
          payload: { title: "Planning", position: 0 },
        },
      ];

      const result = validateActionBatch(actions, state);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.details?.action_index === 1)).toBe(true);
    });
  });
});
