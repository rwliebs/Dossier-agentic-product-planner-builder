import { describe, it, expect, vi, beforeEach } from "vitest";
import { parsePlanningResponse } from "@/lib/llm/parse-planning-response";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import { buildPreviewFromActions } from "@/lib/llm/build-preview-response";
import { createFixtureState } from "./planning-fixtures";
import type { PlanningAction } from "@/lib/schemas/slice-a";
import { v4 as uuidv4 } from "uuid";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const WORKFLOW_ID = "22222222-2222-2222-2222-222222222222";
const ACTIVITY_ID = "33333333-3333-3333-3333-333333333333";

describe("planning integration", () => {
  it("parse -> validate -> preview flow produces consistent result", () => {
    const state = createFixtureState();
    const mockResponse = JSON.stringify([
      {
        id: uuidv4(),
        project_id: PROJECT_ID,
        action_type: "createCard",
        target_ref: { workflow_activity_id: ACTIVITY_ID },
        payload: {
          title: "New card from LLM",
          description: "Test card",
          status: "todo",
          priority: 2,
          position: 1,
        },
      },
    ]);

    const parseResult = parsePlanningResponse(mockResponse);
    expect(parseResult.actions.length).toBeGreaterThan(0);

    const actionsWithProject = parseResult.actions.map((a) => ({
      ...a,
      project_id: a.project_id || PROJECT_ID,
      target_ref: {
        ...a.target_ref,
        project_id:
          (a.target_ref as Record<string, unknown>).project_id ?? PROJECT_ID,
      },
    }));

    const { valid, rejected } = validatePlanningOutput(actionsWithProject, state);
    expect(rejected).toHaveLength(0);
    expect(valid).toHaveLength(1);

    const preview = buildPreviewFromActions(valid, state);
    expect(preview).not.toBeNull();
    expect(preview?.added.cards.length).toBe(1);
    expect(preview?.summary).toBeTruthy();
  });

  it("rejected actions are excluded from preview", () => {
    const state = createFixtureState();
    const invalidAction: PlanningAction = {
      id: uuidv4(),
      project_id: PROJECT_ID,
      action_type: "updateCard",
      target_ref: { card_id: "99999999-9999-9999-9999-999999999999" },
      payload: { title: "Updated" },
    };

    const { valid, rejected } = validatePlanningOutput([invalidAction], state);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);

    const preview = buildPreviewFromActions(valid, state);
    expect(preview).not.toBeNull();
    expect(preview?.added.cards).toHaveLength(0);
  });

  it("code-generation intent is rejected", () => {
    const state = createFixtureState();
    const codeGenAction: PlanningAction = {
      id: uuidv4(),
      project_id: PROJECT_ID,
      action_type: "createCard",
      target_ref: { workflow_activity_id: ACTIVITY_ID },
      payload: {
        title: "Implement login",
        description: "Write the following code: function login() { return true; }",
        status: "todo",
        priority: 1,
        position: 1,
      },
    };

    const { valid, rejected } = validatePlanningOutput([codeGenAction], state);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors.some((e) => e.code === "code_generation_detected")).toBe(true);
  });
});
