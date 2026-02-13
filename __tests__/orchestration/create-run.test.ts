import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRun } from "@/lib/orchestration";
import * as orchestrationQueries from "@/lib/supabase/queries/orchestration";
import * as queries from "@/lib/supabase/queries";

const projectId = "11111111-1111-1111-1111-111111111111";
const cardId = "22222222-2222-2222-2222-222222222222";
const policyId = "33333333-3333-3333-3333-333333333333";

const policy = {
  id: policyId,
  project_id: projectId,
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

vi.mock("@/lib/supabase/queries", () => ({
  getCardIdsByWorkflow: vi.fn(),
  getCardPlannedFiles: vi.fn(),
}));

describe("createRun", () => {
  beforeEach(() => {
    vi.mocked(orchestrationQueries.getSystemPolicyProfileByProject).mockResolvedValue(policy as never);
  });

  it("returns error when no policy exists", async () => {
    vi.mocked(orchestrationQueries.getSystemPolicyProfileByProject).mockResolvedValue(null);

    const mockSupabase = { from: vi.fn() } as never;
    const result = await createRun(mockSupabase, {
      project_id: projectId,
      scope: "card",
      card_id: cardId,
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
        project_id: projectId,
        scope: "card",
        card_id: cardId,
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

  it("returns validation error when card has no approved planned files", async () => {
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([]);

    const mockFrom = vi.fn();
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const result = await createRun(
      { from: mockFrom } as never,
      {
        project_id: projectId,
        scope: "card",
        card_id: cardId,
        trigger_type: "manual",
        initiated_by: "user-123",
        repo_url: "https://github.com/acme/app",
        base_branch: "main",
        run_input_snapshot: { card_id: cardId },
      }
    );

    expect(result.success).toBe(false);
    expect(result.validationErrors?.some((s) => s.includes("no approved planned files"))).toBe(true);
  });

  it("succeeds when card has at least one approved planned file", async () => {
    vi.mocked(queries.getCardPlannedFiles).mockResolvedValue([
      { id: "pf-1", card_id: cardId, status: "approved" },
    ] as never);

    const mockSelect = vi.fn().mockResolvedValue({ data: { id: "run-123" }, error: null });
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSelect }) });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

    const result = await createRun(
      { from: mockFrom } as never,
      {
        project_id: projectId,
        scope: "card",
        card_id: cardId,
        trigger_type: "manual",
        initiated_by: "user-123",
        repo_url: "https://github.com/acme/app",
        base_branch: "main",
        run_input_snapshot: { card_id: cardId },
      }
    );

    expect(result.success).toBe(true);
    expect(result.runId).toBe("run-123");
  });
});
