import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRun } from "@/lib/orchestration";
import * as orchestrationQueries from "@/lib/supabase/queries/orchestration";
import * as queries from "@/lib/supabase/queries";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

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

    const mockDb = createMockDbAdapter();
    const result = await createRun(mockDb, {
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
      createMockDbAdapter(),
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

    const result = await createRun(
      createMockDbAdapter(),
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

    const mockDb = createMockDbAdapter({
      insertOrchestrationRun: vi.fn().mockResolvedValue({ id: "run-123" }),
    });

    const result = await createRun(
      mockDb,
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
