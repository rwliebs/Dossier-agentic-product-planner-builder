import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRun } from "@/lib/orchestration";
import * as orchestrationQueries from "@/lib/supabase/queries/orchestration";

const policy = {
  id: "policy-123",
  project_id: "project-123",
  required_checks: ["dependency", "security", "policy", "integration"],
  protected_paths: [] as string[],
  forbidden_paths: [] as string[],
  dependency_policy: {},
  security_policy: {},
  architecture_policy: {},
  approval_policy: {},
  updated_at: "2025-02-13T12:00:00Z",
};

vi.mock("@/lib/supabase/queries/orchestration", () => ({
  getSystemPolicyProfileByProject: vi.fn(),
  ORCHESTRATION_TABLES: {
    orchestration_runs: "orchestration_runs",
  },
}));

describe("createRun", () => {
  beforeEach(() => {
    vi.mocked(orchestrationQueries.getSystemPolicyProfileByProject).mockResolvedValue(policy as never);
  });

  it("returns error when no policy exists", async () => {
    vi.mocked(orchestrationQueries.getSystemPolicyProfileByProject).mockResolvedValue(null);

    const mockSupabase = { from: vi.fn() } as never;
    const result = await createRun(mockSupabase, {
      project_id: "project-123",
      scope: "card",
      card_id: "card-123",
      trigger_type: "manual",
      initiated_by: "user-123",
      repo_url: "https://github.com/acme/app",
      base_branch: "main",
      run_input_snapshot: { card_id: "card-123" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No system policy profile");
  });

  it("returns validation errors when run_input_snapshot lacks scope target", async () => {
    const result = await createRun(
      { from: vi.fn() } as never,
      {
        project_id: "project-123",
        scope: "card",
        card_id: "card-123",
        trigger_type: "manual",
        initiated_by: "user-123",
        repo_url: "https://github.com/acme/app",
        base_branch: "main",
        run_input_snapshot: {},
      }
    );

    expect(result.success).toBe(false);
    expect(result.validationErrors).toBeDefined();
  });
});
