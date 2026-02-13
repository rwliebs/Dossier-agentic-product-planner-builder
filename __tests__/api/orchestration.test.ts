/**
 * API contract tests for orchestration endpoints.
 * Tests route handler logic with mocked Supabase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListRuns = vi.fn().mockResolvedValue([]);
const mockCreateClient = vi.fn().mockResolvedValue({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
  })),
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock("@/lib/supabase/queries/orchestration", () => ({
  listOrchestrationRunsByProject: (...args: unknown[]) =>
    mockListRuns(...args),
  ORCHESTRATION_TABLES: { orchestration_runs: "orchestration_runs" },
}));

describe("Orchestration API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListRuns.mockResolvedValue([]);
  });

  it("GET runs route returns runs array", async () => {
    const { GET } = await import(
      "@/app/api/projects/[projectId]/orchestration/runs/route"
    );
    const req = new Request("http://localhost/api/projects/proj-123/orchestration/runs");
    const res = await GET(req, {
      params: Promise.resolve({ projectId: "proj-123" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("runs");
    expect(Array.isArray(body.runs)).toBe(true);
  });

  it("POST runs route returns 400 when run_input_snapshot missing", async () => {
    const { POST } = await import(
      "@/app/api/projects/[projectId]/orchestration/runs/route"
    );
    const req = new Request(
      "http://localhost/api/projects/proj-123/orchestration/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "card",
          initiated_by: "user",
          repo_url: "https://github.com/acme/app",
          base_branch: "main",
        }),
      }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId: "proj-123" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("run_input_snapshot");
  });
});
