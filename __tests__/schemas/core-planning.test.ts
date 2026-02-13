import {
  cardSchema,
  planningActionSchema,
  projectSchema,
  stepSchema,
  workflowActivitySchema,
  workflowSchema,
} from "@/lib/schemas/slice-a";

describe("slice A schema contracts", () => {
  const ids = {
    project: "11111111-1111-4111-8111-111111111111",
    workflow: "22222222-2222-4222-8222-222222222222",
    activity: "33333333-3333-4333-8333-333333333333",
    step: "44444444-4444-4444-8444-444444444444",
    card: "55555555-5555-4555-8555-555555555555",
    action: "66666666-6666-4666-8666-666666666666",
  };

  it("validates project shape", () => {
    const parsed = projectSchema.parse({
      id: ids.project,
      name: "Dossier",
      repo_url: "https://github.com/acme/dossier",
      default_branch: "main",
    });
    expect(parsed.name).toBe("Dossier");
  });

  it("rejects invalid workflow relationship fields", () => {
    expect(() =>
      workflowSchema.parse({
        id: ids.workflow,
        project_id: "not-a-uuid",
        title: "Core Workflow",
        position: 1,
      }),
    ).toThrow();
  });

  it("validates activity, step, and card contracts", () => {
    const activity = workflowActivitySchema.parse({
      id: ids.activity,
      workflow_id: ids.workflow,
      title: "Plan",
      color: "blue",
      position: 1,
    });
    const step = stepSchema.parse({
      id: ids.step,
      workflow_activity_id: activity.id,
      title: "Define cards",
      position: 1,
    });
    const card = cardSchema.parse({
      id: ids.card,
      workflow_activity_id: activity.id,
      step_id: step.id,
      title: "Create story map card",
      status: "todo",
      priority: 1,
    });

    expect(card.status).toBe("todo");
  });

  it("validates PlanningAction envelope", () => {
    const action = planningActionSchema.parse({
      id: ids.action,
      project_id: ids.project,
      action_type: "createCard",
      target_ref: { workflow_id: ids.workflow },
      payload: { title: "New card" },
    });

    expect(action.action_type).toBe("createCard");
  });
});
