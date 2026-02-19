/**
 * API contract tests for card finalize endpoint.
 * Covers GET (assemble package) and POST (confirm finalization) per Workflow E.
 *
 * Product outcomes (user-workflows-reference.md):
 * - Build trigger requires finalized_at in addition to approved planned files
 * - POST finalize validates requirements + planned files; sets finalized_at
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

const projectId = "11111111-1111-1111-1111-111111111111";
const cardId = "22222222-2222-2222-2222-222222222222";

const mockDb = createMockDbAdapter({
  verifyCardInProject: vi.fn().mockResolvedValue(true),
  getCardById: vi.fn().mockResolvedValue({
    id: cardId,
    title: "Test Card",
    finalized_at: null,
  }),
  getArtifactsByProject: vi.fn().mockResolvedValue([]),
  getCardContextArtifacts: vi.fn().mockResolvedValue([]),
  getCardRequirements: vi.fn().mockResolvedValue([{ id: "r1", text: "Requirement 1", source: "user" }]),
  getCardPlannedFiles: vi.fn().mockResolvedValue([
    { id: "pf1", status: "approved", logical_file_name: "src/feature.ts" },
  ]),
  updateCard: vi.fn().mockResolvedValue(undefined),
});

vi.mock("@/lib/db", () => ({
  getDb: () => mockDb,
}));

describe("Card finalize API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockDb.verifyCardInProject).mockResolvedValue(true);
    vi.mocked(mockDb.getCardById).mockResolvedValue({
      id: cardId,
      title: "Test Card",
      finalized_at: null,
    } as never);
    vi.mocked(mockDb.getArtifactsByProject).mockResolvedValue([]);
    vi.mocked(mockDb.getCardContextArtifacts).mockResolvedValue([]);
    vi.mocked(mockDb.getCardRequirements).mockResolvedValue([
      { id: "r1", text: "Requirement 1", source: "user" },
    ] as never);
    vi.mocked(mockDb.getCardPlannedFiles).mockResolvedValue([
      { id: "pf1", status: "approved", logical_file_name: "src/feature.ts" },
    ] as never);
    vi.mocked(mockDb.updateCard).mockResolvedValue(undefined);
  });

  it("GET returns finalization package with card, project docs, requirements, planned files", async () => {
    const { GET } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new Request(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`
    );
    const res = await GET(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("card");
    expect(body).toHaveProperty("project_docs");
    expect(body).toHaveProperty("card_artifacts");
    expect(body).toHaveProperty("requirements");
    expect(body).toHaveProperty("planned_files");
    expect(body).toHaveProperty("finalized_at");
    expect(Array.isArray(body.project_docs)).toBe(true);
    expect(Array.isArray(body.requirements)).toBe(true);
    expect(Array.isArray(body.planned_files)).toBe(true);
  });

  it("POST sets finalized_at when card has requirements and planned files", async () => {
    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new Request(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("finalized_at");
    expect(typeof body.finalized_at).toBe("string");
    expect(mockDb.updateCard).toHaveBeenCalledWith(
      cardId,
      expect.objectContaining({ finalized_at: expect.any(String) })
    );
  });

  it("POST returns 400 when card has no requirements", async () => {
    vi.mocked(mockDb.getCardRequirements).mockResolvedValue([]);

    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new Request(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/requirement/i);
    expect(mockDb.updateCard).not.toHaveBeenCalled();
  });

  it("POST returns 400 when card has no planned files", async () => {
    vi.mocked(mockDb.getCardPlannedFiles).mockResolvedValue([]);

    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new Request(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/planned file/i);
    expect(mockDb.updateCard).not.toHaveBeenCalled();
  });

  it("GET returns 404 when card not in project", async () => {
    vi.mocked(mockDb.verifyCardInProject).mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new Request(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`
    );
    const res = await GET(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(404);
  });

  it("POST returns 404 when card not in project", async () => {
    vi.mocked(mockDb.verifyCardInProject).mockResolvedValue(false);

    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new Request(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(404);
    expect(mockDb.updateCard).not.toHaveBeenCalled();
  });
});
