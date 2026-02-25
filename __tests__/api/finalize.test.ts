/**
 * API contract tests for card finalize endpoint.
 * Covers GET (assemble package) and POST (confirm finalization) per Workflow E.
 *
 * Product outcomes (user-workflows-reference.md):
 * - Project must be finalized before cards can be finalized
 * - Build trigger requires finalized_at and approved planned files/folders
 * - POST finalize validates: project finalized, requirements, approved planned files/folders
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockDbAdapter } from "@/__tests__/lib/mock-db-adapter";

const projectId = "11111111-1111-1111-1111-111111111111";
const cardId = "22222222-2222-2222-2222-222222222222";

const mockDb = createMockDbAdapter({
  getProject: vi.fn().mockResolvedValue({
    id: projectId,
    finalized_at: "2026-01-01T00:00:00.000Z",
  }),
  verifyCardInProject: vi.fn().mockResolvedValue(true),
  getCardById: vi.fn().mockResolvedValue({
    id: cardId,
    title: "Test Card",
    description: "A test card",
    finalized_at: null,
  }),
  getArtifactsByProject: vi.fn().mockResolvedValue([]),
  getCardContextArtifacts: vi.fn().mockResolvedValue([]),
  getCardRequirements: vi.fn().mockResolvedValue([{ id: "r1", text: "Requirement 1", source: "user", status: "draft" }]),
  getCardPlannedFiles: vi.fn().mockResolvedValue([
    { id: "pf1", status: "approved", logical_file_name: "src/feature.ts", artifact_kind: "component", action: "create", intent_summary: "Feature component" },
  ]),
  updateCard: vi.fn().mockResolvedValue(undefined),
  insertCardContextArtifact: vi.fn().mockResolvedValue(undefined),
});

vi.mock("@/lib/db", () => ({
  getDb: () => mockDb,
}));

vi.mock("@/lib/feature-flags", () => ({
  PLANNING_LLM: true,
  MEMORY_PLANE: false,
}));

vi.mock("@/lib/memory/ingestion", () => ({
  ingestCardContext: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/db/map-snapshot", () => ({
  fetchMapSnapshot: vi.fn().mockResolvedValue({
    project: {
      id: projectId,
      name: "Test Project",
      description: "A test project",
      tech_stack: "React",
      deployment: "Vercel",
    },
    workflows: new Map(),
    activities: new Map(),
    cards: new Map(),
    contextArtifacts: new Map(),
    cardContextLinks: new Map(),
    cardRequirements: new Map(),
    cardFacts: new Map(),
    cardAssumptions: new Map(),
    cardQuestions: new Map(),
    cardPlannedFiles: new Map(),
  }),
}));

vi.mock("@/lib/llm/run-llm-substep", () => ({
  runLlmSubStep: vi.fn().mockResolvedValue({ actionCount: 1, updatedState: {} }),
}));

/** Parse SSE text into an array of { event, data } objects. */
function parseSSE(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split(/\n\n+/)) {
    if (!block.trim()) continue;
    let event = "";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (event && dataStr) {
      try {
        events.push({ event, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event, data: dataStr });
      }
    }
  }
  return events;
}

describe("Card finalize API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockDb.getProject).mockResolvedValue({
      id: projectId,
      finalized_at: "2026-01-01T00:00:00.000Z",
    } as never);
    vi.mocked(mockDb.verifyCardInProject).mockResolvedValue(true);
    vi.mocked(mockDb.getCardById).mockResolvedValue({
      id: cardId,
      title: "Test Card",
      description: "A test card",
      finalized_at: null,
    } as never);
    vi.mocked(mockDb.getArtifactsByProject).mockResolvedValue([]);
    vi.mocked(mockDb.getCardContextArtifacts).mockResolvedValue([]);
    vi.mocked(mockDb.getCardRequirements).mockResolvedValue([
      { id: "r1", text: "Requirement 1", source: "user", status: "draft" },
    ] as never);
    vi.mocked(mockDb.getCardPlannedFiles).mockResolvedValue([
      { id: "pf1", status: "approved", logical_file_name: "src/feature.ts", artifact_kind: "component", action: "create", intent_summary: "Feature component" },
    ] as never);
    vi.mocked(mockDb.updateCard).mockResolvedValue(undefined);
  });

  it("GET returns finalization package with card, project docs, requirements, planned files", async () => {
    const { GET } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new NextRequest(
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

  it("POST returns SSE stream, generates test, and sets finalized_at", async () => {
    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new NextRequest(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await res.text();
    const events = parseSSE(text);

    const progressEvents = events.filter((e) => e.event === "finalize_progress");
    expect(progressEvents.length).toBeGreaterThanOrEqual(3);

    const phaseComplete = events.find((e) => e.event === "phase_complete");
    expect(phaseComplete).toBeDefined();
    const pcData = phaseComplete!.data as Record<string, unknown>;
    expect(pcData.responseType).toBe("card_finalize_complete");
    expect(pcData.card_id).toBe(cardId);
    expect(pcData.finalized_at).toBeDefined();

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
    const req = new NextRequest(
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

  it("POST returns 400 when card has requirements but no approved planned files", async () => {
    vi.mocked(mockDb.getCardPlannedFiles).mockResolvedValue([]);

    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new NextRequest(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/planned file|planned folder/i);
    expect(mockDb.updateCard).not.toHaveBeenCalled();
  });

  it("POST returns 400 when project is not finalized", async () => {
    vi.mocked(mockDb.getProject).mockResolvedValue({
      id: projectId,
      finalized_at: null,
    } as never);

    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new NextRequest(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/project must be finalized/i);
    expect(mockDb.updateCard).not.toHaveBeenCalled();
  });

  it("POST returns 400 when card is already finalized", async () => {
    vi.mocked(mockDb.getCardById).mockResolvedValue({
      id: cardId,
      title: "Test Card",
      finalized_at: "2026-01-01T00:00:00.000Z",
    } as never);

    const { POST } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new NextRequest(
      `http://localhost/api/projects/${projectId}/cards/${cardId}/finalize`,
      { method: "POST" }
    );
    const res = await POST(req, {
      params: Promise.resolve({ projectId, cardId }),
    });

    expect(res.status).toBe(400);
    expect(mockDb.updateCard).not.toHaveBeenCalled();
  });

  it("GET returns 404 when card not in project", async () => {
    vi.mocked(mockDb.verifyCardInProject).mockResolvedValue(false);

    const { GET } = await import(
      "@/app/api/projects/[projectId]/cards/[cardId]/finalize/route"
    );
    const req = new NextRequest(
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
    const req = new NextRequest(
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
