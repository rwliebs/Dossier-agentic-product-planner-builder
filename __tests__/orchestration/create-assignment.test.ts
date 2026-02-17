import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAssignment } from "@/lib/orchestration";
import * as orchestrationQueries from "@/lib/supabase/queries/orchestration";

const run = {
  id: "run-123",
  project_id: "project-123",
  system_policy_snapshot: { forbidden_paths: [] as string[] },
};

vi.mock("@/lib/supabase/queries/orchestration", () => ({
  getOrchestrationRun: vi.fn(),
  ORCHESTRATION_TABLES: {
    card_assignments: "card_assignments",
  },
}));

describe("createAssignment", () => {
  beforeEach(() => {
    vi.mocked(orchestrationQueries.getOrchestrationRun).mockResolvedValue(run as never);
  });

  it("returns error when feature_branch equals default_branch", async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === "project") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { default_branch: "main" },
                error: null,
              }),
            })),
          })),
        };
      }
      return {};
    });
    const mockSupabase = { from: mockFrom } as never;

    const result = await createAssignment(mockSupabase, {
      run_id: "run-123",
      card_id: "card-123",
      agent_role: "coder",
      agent_profile: "claude-opus",
      feature_branch: "main",
      allowed_paths: ["src/"],
      assignment_input_snapshot: {},
    });

    expect(result.success).toBe(false);
    expect(result.validationErrors).toBeDefined();
    expect(result.validationErrors?.[0]).toContain("default_branch");
  });

  it("returns error when allowed_paths is empty", async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === "project") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { default_branch: "main" },
                error: null,
              }),
            })),
          })),
        };
      }
      return {};
    });
    const mockSupabase = { from: mockFrom } as never;

    const result = await createAssignment(mockSupabase, {
      run_id: "run-123",
      card_id: "card-123",
      agent_role: "coder",
      agent_profile: "claude-opus",
      feature_branch: "feat/card-123",
      allowed_paths: [],
      assignment_input_snapshot: {},
    });

    expect(result.success).toBe(false);
    expect(result.validationErrors).toBeDefined();
    expect(result.validationErrors?.[0]).toContain("non-empty");
  });
});
