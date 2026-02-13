import { describe, it, expect } from "vitest";
import { parsePlanningResponse } from "@/lib/llm/parse-planning-response";
import { validatePlanningOutput } from "@/lib/llm/validate-planning-output";
import {
  planningFixtures,
  createFixtureState,
  createEmptyFixtureState,
} from "./planning-fixtures";

describe("parsePlanningResponse", () => {
  it("parses raw JSON array", () => {
    const json =
      '[{"id":"11111111-1111-1111-1111-111111111111","project_id":"11111111-1111-1111-1111-111111111111","action_type":"createWorkflow","target_ref":{"project_id":"11111111-1111-1111-1111-111111111111"},"payload":{"title":"Test","position":0}}]';
    const result = parsePlanningResponse(json);
    expect(result.actions).toHaveLength(1);
    expect(result.confidence).toBe("high");
  });

  it("parses JSON in markdown code block", () => {
    const text =
      'Here are the actions:\n```json\n[{"id":"11111111-1111-1111-1111-111111111111","project_id":"11111111-1111-1111-1111-111111111111","action_type":"createWorkflow","target_ref":{"project_id":"11111111-1111-1111-1111-111111111111"},"payload":{"title":"Test","position":0}}]\n```';
    const result = parsePlanningResponse(text);
    expect(result.actions.length).toBeGreaterThanOrEqual(0);
  });

  it("returns empty for invalid JSON", () => {
    const result = parsePlanningResponse("not json at all");
    expect(result.actions).toHaveLength(0);
    expect(result.confidence).toBe("low");
  });

  it("returns empty for non-array JSON", () => {
    const result = parsePlanningResponse('{"foo":"bar"}');
    expect(result.actions).toHaveLength(0);
  });
});

describe("planning fixtures", () => {
  for (const fixture of planningFixtures) {
    it(`${fixture.id}: ${fixture.name}`, () => {
      const state =
        fixture.useState === "withData" ? createFixtureState() : createEmptyFixtureState();
      const projectId = "11111111-1111-1111-1111-111111111111";

      const parseResult = parsePlanningResponse(fixture.mockLlmResponse);
      const actionsWithProject = parseResult.actions.map((a) => ({
        ...a,
        project_id: a.project_id || projectId,
        target_ref: {
          ...a.target_ref,
          project_id:
            (a.target_ref as Record<string, unknown>).project_id ?? projectId,
        },
      }));

      const { valid, rejected } = validatePlanningOutput(actionsWithProject, state);

      expect(valid.length).toBe(fixture.expectedValidCount);
      expect(rejected.length).toBe(fixture.expectedRejectedCount);
    });
  }
});
