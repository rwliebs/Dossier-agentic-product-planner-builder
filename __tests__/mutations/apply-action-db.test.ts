/**
 * Unit tests for action mutation logic (applyAction).
 * Tests validation and rejection paths without requiring a real DB.
 */

import { applyAction } from "@/lib/supabase/mutations";

const createMockSupabase = () =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
  }) as unknown as Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

describe("applyAction", () => {
  it("rejects code-generation intent in payload", async () => {
    const supabase = createMockSupabase();
    const result = await applyAction(supabase, "p1", {
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
    const supabase = createMockSupabase();
    const result = await applyAction(supabase, "p1", {
      action_type: "unknownAction",
      target_ref: {},
      payload: {},
    });
    expect(result.applied).toBe(false);
    expect(result.rejectionReason).toContain("Unsupported");
  });
});
