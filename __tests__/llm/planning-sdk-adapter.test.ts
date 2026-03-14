/**
 * TDD: Planning transport adapter contract (Issue #10).
 * When planning uses Agent SDK path, response must match ClaudePlanningResponse
 * and .text must be parseable by existing parsers.
 */

import { describe, it, expect } from "vitest";
import { parsePlanningResponse } from "@/lib/llm/parse-planning-response";
import { planningResponseFromSdkText } from "@/lib/llm/planning-sdk-bridge";
import type { ClaudePlanningResponse } from "@/lib/llm/claude-client";

const VALID_PLANNING_JSON =
  '{"type":"actions","message":"Done","actions":[{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","project_id":"p1a2b3c4-d5e6-7890-abcd-ef1234567890","action_type":"createWorkflow","target_ref":{"project_id":"p1a2b3c4-d5e6-7890-abcd-ef1234567890"},"payload":{"title":"W1","position":0}}]}\n';

describe("planning SDK adapter contract (Issue #10)", () => {
  it("ClaudePlanningResponse .text is parseable by parsePlanningResponse", () => {
    const response: ClaudePlanningResponse = {
      text: VALID_PLANNING_JSON,
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 20 },
      model: "claude-haiku-4-5-20251001",
    };
    const parsed = parsePlanningResponse(response.text);
    expect(parsed).toHaveProperty("actions");
    expect(Array.isArray(parsed.actions)).toBe(true);
    expect(parsed.actions.length).toBeGreaterThanOrEqual(0);
  });

  it("planningResponseFromSdkText returns valid ClaudePlanningResponse shape", () => {
    const raw = "Some preamble\n" + VALID_PLANNING_JSON;
    const response = planningResponseFromSdkText(raw);
    expect(response).toMatchObject({
      text: expect.any(String),
      usage: { inputTokens: expect.any(Number), outputTokens: expect.any(Number) },
      model: expect.any(String),
    });
    expect(response.stopReason === null || typeof response.stopReason === "string").toBe(true);
    const parsed = parsePlanningResponse(response.text);
    expect(parsed.actions.length).toBeGreaterThanOrEqual(0);
  });
});
