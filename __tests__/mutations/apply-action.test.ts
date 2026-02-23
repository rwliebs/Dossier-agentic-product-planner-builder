import { applyAction } from "@/lib/actions/apply-action";
import {
  previewAction,
  applyActionBatch,
  previewActionBatch,
} from "@/lib/actions/preview-action";
import {
  createEmptyPlanningState,
  type PlanningState,
} from "@/lib/schemas/planning-state";
import type { Project, PlanningAction } from "@/lib/schemas/slice-a";

describe("Action Application (Mutations)", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const workflowId = "22222222-2222-4222-8222-222222222222";
  const activityId = "33333333-3333-4333-8333-333333333333";
  const cardId = "55555555-5555-4555-8555-555555555555";

  let project: Project;
  let initialState: PlanningState;

  beforeEach(() => {
    project = {
      id: projectId,
      name: "Test Project",
      repo_url: "https://github.com/test/project",
      default_branch: "main",
    };

    initialState = createEmptyPlanningState(project);
  });

  describe("Create Workflow", () => {
    it("creates workflow in state", () => {
      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createWorkflow",
        target_ref: { project_id: projectId },
        payload: {
          title: "Core Features",
          description: "Main feature work",
          position: 0,
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);
      expect(result.newState!.workflows.size).toBe(1);
    });
  });

  describe("Create Activity", () => {
    it("creates activity under workflow", () => {
      // First create workflow
      initialState.workflows.set(workflowId, {
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
          title: "Planning Phase",
          color: "blue",
          position: 0,
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);
      expect(result.newState!.activities.size).toBe(1);

      const activity = Array.from(result.newState!.activities.values())[0];
      expect(activity.title).toBe("Planning Phase");
      expect(activity.workflow_id).toBe(workflowId);
    });
  });

  describe("Create Card", () => {
    it("creates card under activity", () => {
      initialState.activities.set(activityId, {
        id: activityId,
        workflow_id: workflowId,
        title: "Planning",
        position: 0,
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Design data model",
          description: "Create ERD and schemas",
          status: "active",
          priority: 1,
          position: 0,
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);
      expect(result.newState!.cards.size).toBe(1);

      const card = Array.from(result.newState!.cards.values())[0];
      expect(card.title).toBe("Design data model");
      expect(card.status).toBe("active");
    });
  });

  describe("Reorder Card", () => {
    it("updates card position when reordering", () => {
      initialState.activities.set(activityId, {
        id: activityId,
        workflow_id: workflowId,
        title: "Planning",
        position: 0,
      });
      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "Card",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "reorderCard",
        target_ref: { card_id: cardId },
        payload: {
          new_position: 2,
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const reorderedCard = result.newState!.cards.get(cardId);
      expect(reorderedCard!.position).toBe(2);
    });
  });

  describe("Update Card", () => {
    it("updates card title and status", () => {
      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "Old Title",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "updateCard",
        target_ref: { card_id: cardId },
        payload: {
          title: "New Title",
          status: "active",
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const updatedCard = result.newState!.cards.get(cardId);
      expect(updatedCard!.title).toBe("New Title");
      expect(updatedCard!.status).toBe("active");
    });
  });

  describe("Link Context Artifact", () => {
    it("links artifact to card", () => {
      const artifactId = "66666666-6666-4666-8666-666666666666";

      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "Design",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      initialState.contextArtifacts.set(artifactId, {
        id: artifactId,
        project_id: projectId,
        name: "Design System",
        type: "doc",
        content: "Color palette, typography, components",
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "linkContextArtifact",
        target_ref: { card_id: cardId },
        payload: {
          context_artifact_id: artifactId,
          usage_hint: "Reference for UI components",
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const links = result.newState!.cardContextLinks.get(cardId);
      expect(links).toBeDefined();
      expect(links!.has(artifactId)).toBe(true);
    });
  });

  describe("Planned Files", () => {
    it("creates planned file on card", () => {
      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "Auth Component",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "upsertCardPlannedFile",
        target_ref: { card_id: cardId },
        payload: {
          logical_file_name: "src/components/AuthProvider.tsx",
          module_hint: "authentication",
          artifact_kind: "component",
          action: "create",
          intent_summary: "React context and hook for authentication",
          contract_notes: "Export AuthProvider and useAuth hook",
          position: 0,
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const files = result.newState!.cardPlannedFiles.get(cardId);
      expect(files).toBeDefined();
      expect(files![0].logical_file_name).toBe("src/components/AuthProvider.tsx");
      expect(files![0].status).toBe("proposed");
    });

    it("approves planned file", () => {
      const plannedFileId = "77777777-7777-4777-8777-777777777777";

      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "Auth",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      initialState.cardPlannedFiles.set(cardId, [
        {
          id: plannedFileId,
          card_id: cardId,
          logical_file_name: "src/components/Auth.tsx",
          module_hint: "auth",
          artifact_kind: "component",
          action: "create",
          intent_summary: "Auth component",
          contract_notes: null,
          status: "proposed",
          position: 0,
        },
      ]);

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "approveCardPlannedFile",
        target_ref: { card_id: cardId },
        payload: {
          planned_file_id: plannedFileId,
          status: "approved",
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const files = result.newState!.cardPlannedFiles.get(cardId);
      expect(files![0].status).toBe("approved");
    });
  });

  describe("Knowledge Items", () => {
    it("creates requirement on card", () => {
      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "API Design",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "upsertCardKnowledgeItem",
        target_ref: { card_id: cardId },
        payload: {
          item_type: "requirement",
          text: "API must support OAuth 2.0",
          position: 0,
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const requirements = result.newState!.cardRequirements.get(cardId);
      expect(requirements).toBeDefined();
      expect(requirements![0].text).toContain("OAuth");
    });

    it("changes knowledge item status", () => {
      const requirementId = "88888888-8888-4888-8888-888888888888";

      initialState.cardRequirements.set(cardId, [
        {
          id: requirementId,
          card_id: cardId,
          text: "Support pagination",
          status: "draft",
          source: "user",
          confidence: null,
          position: 0,
        },
      ]);

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "setCardKnowledgeStatus",
        target_ref: { card_id: cardId },
        payload: {
          knowledge_item_id: requirementId,
          status: "approved",
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      const requirements = result.newState!.cardRequirements.get(cardId);
      expect(requirements![0].status).toBe("approved");
    });

    it("does not mutate original state when changing knowledge item status", () => {
      const requirementId = "88888888-8888-4888-8888-888888888888";
      const originalStatus = "draft";

      initialState.cardRequirements.set(cardId, [
        {
          id: requirementId,
          card_id: cardId,
          text: "Support pagination",
          status: originalStatus,
          source: "user",
          confidence: null,
          position: 0,
        },
      ]);

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "setCardKnowledgeStatus",
        target_ref: { card_id: cardId },
        payload: {
          knowledge_item_id: requirementId,
          status: "approved",
        },
      };

      const result = applyAction(action, initialState);
      expect(result.success).toBe(true);

      // Original state must be unchanged (immutability)
      const originalRequirements = initialState.cardRequirements.get(cardId);
      expect(originalRequirements![0].status).toBe(originalStatus);
    });

    it("does not mutate original state when previewActionBatch runs setCardKnowledgeStatus", () => {
      const requirementId = "88888888-8888-4888-8888-888888888888";
      const originalStatus = "draft";

      initialState.cards.set(cardId, {
        id: cardId,
        workflow_activity_id: activityId,
        title: "API Design",
        description: null,
        status: "todo",
        priority: 1,
        position: 0,
      });

      initialState.cardRequirements.set(cardId, [
        {
          id: requirementId,
          card_id: cardId,
          text: "Support pagination",
          status: originalStatus,
          source: "user",
          confidence: null,
          position: 0,
        },
      ]);

      const action: PlanningAction = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "setCardKnowledgeStatus",
        target_ref: { card_id: cardId },
        payload: {
          knowledge_item_id: requirementId,
          status: "approved",
        },
      };

      const previews = previewActionBatch([action], initialState);
      expect(previews).toBeDefined();
      expect(previews!.length).toBe(1);

      // Original state must be unchanged after dry-run preview (immutability contract)
      const originalRequirements = initialState.cardRequirements.get(cardId);
      expect(originalRequirements![0].status).toBe(originalStatus);
    });
  });
});

describe("Action Preview", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const activityId = "33333333-3333-4333-8333-333333333333";
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

  it("previews createCard action", () => {
    const state = createEmptyPlanningState(project);

    state.activities.set(activityId, {
      id: activityId,
      workflow_id: "workflow-id",
      title: "Planning",
      position: 0,
    });

    const action: PlanningAction = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      project_id: projectId,
      action_type: "createCard",
      target_ref: { workflow_activity_id: activityId },
      payload: {
        title: "New Card",
        status: "todo",
        priority: 1,
        position: 0,
      },
    };

    const preview = previewAction(action, state);
    expect(preview).toBeDefined();
    expect(preview!.created_ids.length).toBeGreaterThan(0);
    expect(preview!.summary).toContain("New Card");
  });
});

describe("Batch Mutations", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const activityId = "33333333-3333-4333-8333-333333333333";
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

  it("applies multiple actions in sequence", () => {
    const state = createEmptyPlanningState(project);

    state.activities.set(activityId, {
      id: activityId,
      workflow_id: "workflow-id",
      title: "Planning",
      position: 0,
    });

    const actions: PlanningAction[] = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Card 1",
          status: "todo",
          priority: 1,
          position: 0,
        },
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Card 2",
          status: "todo",
          priority: 2,
          position: 1,
        },
      },
    ];

    const result = applyActionBatch(actions, state);
    expect(result.success).toBe(true);
    expect(result.applied_count).toBe(2);
    expect(result.final_state!.cards.size).toBe(2);
  });

  it("rolls back on failure", () => {
    const state = createEmptyPlanningState(project);

    // Create actions where the second one has bad data
    const actions: PlanningAction[] = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Card",
          status: "todo",
          priority: 1,
          position: 0,
        },
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        project_id: projectId,
        action_type: "updateCard",
        target_ref: { card_id: "nonexistent-card-id" },
        payload: {
          title: "Updated",
        },
      },
    ];

    // Need to set up the activity first for first action to work
    state.activities.set(activityId, {
      id: activityId,
      workflow_id: "workflow-id",
      title: "Planning",
      position: 0,
    });

    const result = applyActionBatch(actions, state);
    expect(result.success).toBe(false);
    expect(result.failed_at_index).toBe(1);
    expect(result.final_state).toBeUndefined();
  });

  it("previews batch without mutation", () => {
    const state = createEmptyPlanningState(project);

    state.activities.set(activityId, {
      id: activityId,
      workflow_id: "workflow-id",
      title: "Planning",
      position: 0,
    });

    const actions: PlanningAction[] = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Card 1",
          status: "todo",
          priority: 1,
          position: 0,
        },
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        project_id: projectId,
        action_type: "createCard",
        target_ref: { workflow_activity_id: activityId },
        payload: {
          title: "Card 2",
          status: "todo",
          priority: 2,
          position: 1,
        },
      },
    ];

    const previews = previewActionBatch(actions, state);
    expect(previews).toBeDefined();
    expect(previews!.length).toBe(2);

    // State should not be mutated
    expect(state.cards.size).toBe(0);
  });
});
