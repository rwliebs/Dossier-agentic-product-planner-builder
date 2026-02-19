/**
 * Unit tests for action mutation logic (applyAction).
 * Tests validation and rejection paths without requiring a real DB.
 */

import { applyAction } from "@/lib/db/mutations";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

describe("applyAction", () => {
  it("rejects code-generation intent in payload", async () => {
    const db = createMockDbAdapter();
    const result = await applyAction(db, "p1", {
      action_type: "createCard",
      target_ref: { workflow_activity_id: "a1" },
      payload: {
        title: "Card",
        status: "todo",
        priority: 1,
        intent_summary: "Generate code for the component",
      },
    });
    expect(result.applied).toBe(false);
    expect(result.rejectionReason).toContain("forbidden");
  });

  it("rejects unsupported action type", async () => {
    const db = createMockDbAdapter();
    const result = await applyAction(db, "p1", {
      action_type: "unknownAction",
      target_ref: {},
      payload: {},
    });
    expect(result.applied).toBe(false);
    expect(result.rejectionReason).toContain("Unsupported");
  });
});
