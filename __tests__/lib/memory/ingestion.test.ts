/**
 * Ingestion pipeline tests (M8).
 * Mock path: tests pass without RuVector.
 * Integration path: real SQLite + RuVector when available.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { ingestMemoryUnit, ingestCardContext } from "@/lib/memory/ingestion";
import { createMockDbAdapter } from "../mock-db-adapter";
import { createTestDb } from "../create-test-db";
import { ruvectorAvailable, cleanupRuvectorTestVectors } from "../ruvector-test-helpers";
import { getRuvectorClient } from "@/lib/ruvector/client";
import { resetRuvectorForTesting } from "@/lib/ruvector/client";

vi.mock("@/lib/ruvector/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/ruvector/client")>();
  return { ...mod, getRuvectorClient: vi.fn() };
});

const sqliteAvailable = (() => {
  try {
    const Database = require("better-sqlite3");
    new Database(":memory:").close();
    return true;
  } catch {
    return false;
  }
})();

function setupCardHierarchy(db: ReturnType<typeof createTestDb>) {
  const projectId = crypto.randomUUID();
  const workflowId = crypto.randomUUID();
  const activityId = crypto.randomUUID();
  const cardId = crypto.randomUUID();

  db.insertProject({
    id: projectId,
    name: "Test Project",
    repo_url: null,
    default_branch: "main",
  });
  db.insertWorkflow({
    id: workflowId,
    project_id: projectId,
    title: "Workflow",
    description: null,
    position: 0,
  });
  db.insertWorkflowActivity({
    id: activityId,
    workflow_id: workflowId,
    title: "Activity",
    position: 0,
  });
  db.insertCard({
    id: cardId,
    workflow_activity_id: activityId,
    title: "Card",
    description: "Card description",
    status: "todo",
    priority: 0,
    position: 0,
  });

  return { projectId, workflowId, activityId, cardId };
}

describe("Ingestion pipeline (M8)", () => {
  let db: ReturnType<typeof createMockDbAdapter>;

  beforeEach(() => {
    db = createMockDbAdapter();
    vi.mocked(getRuvectorClient).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ingestMemoryUnit", () => {
    it("returns null when RuVector unavailable (mock path)", async () => {
      const id = await ingestMemoryUnit(
        db,
        { contentText: "test content", title: "Test" },
        { cardId: "c1", projectId: "p1" }
      );
      expect(id).toBeNull();
    });

    it("returns null for empty content", async () => {
      const id = await ingestMemoryUnit(
        db,
        { contentText: "", title: "Empty" },
        { cardId: "c1", projectId: "p1" }
      );
      expect(id).toBeNull();
    });
  });

  describe("ingestCardContext", () => {
    it("returns 0 when RuVector unavailable", async () => {
      db.getCardById = vi.fn().mockResolvedValue({
        id: "c1",
        title: "Card",
        description: "Desc",
      });
      db.verifyCardInProject = vi.fn().mockResolvedValue(true);
      const count = await ingestCardContext(db, "c1", "p1");
      expect(count).toBe(0);
    });

    it("returns 0 when card not found", async () => {
      db.getCardById = vi.fn().mockResolvedValue(null);
      const count = await ingestCardContext(db, "c1", "p1");
      expect(count).toBe(0);
    });

    it("returns 0 when card not in project", async () => {
      db.getCardById = vi.fn().mockResolvedValue({ id: "c1" });
      db.verifyCardInProject = vi.fn().mockResolvedValue(false);
      const count = await ingestCardContext(db, "c1", "p1");
      expect(count).toBe(0);
    });
  });

  describe.skipIf(!ruvectorAvailable || !sqliteAvailable)("integration with real RuVector", () => {
    let realGetRuvectorClient: typeof getRuvectorClient;
    let sqliteDb: ReturnType<typeof createTestDb>;
    const insertedIds: string[] = [];

    beforeAll(async () => {
      const mod = await vi.importActual<typeof import("@/lib/ruvector/client")>("@/lib/ruvector/client");
      realGetRuvectorClient = mod.getRuvectorClient;
    });

    beforeEach(() => {
      resetRuvectorForTesting();
      vi.mocked(getRuvectorClient).mockImplementation(realGetRuvectorClient);
      sqliteDb = createTestDb();
    });

    afterEach(async () => {
      const client = getRuvectorClient();
      if (client) await cleanupRuvectorTestVectors(insertedIds, client);
      insertedIds.length = 0;
    });

    it.skipIf(() => getRuvectorClient() === null)(
      "ingestMemoryUnit: when client available, content is stored and retrievable",
      async () => {
        const id = await ingestMemoryUnit(
          sqliteDb,
          { contentText: "integration test memory content", title: "Integration Test" },
          { cardId: "c1", projectId: "p1" }
        );
        expect(id).not.toBeNull();
        if (!id) return;
        insertedIds.push(id);

        const units = await sqliteDb.getMemoryUnitsByIds([id]);
        expect(units).toHaveLength(1);
        expect(units[0].content_text).toBe("integration test memory content");
        expect(units[0].embedding_ref).toBe(id);

        const vec = await import("@/lib/memory/embedding").then((m) => m.embedText("integration test memory content"));
        const client = getRuvectorClient();
        expect(client).not.toBeNull();
        const results = await client!.search({ vector: vec, k: 5 });
        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.id === id)).toBe(true);
      }
    );

    it.skipIf(() => getRuvectorClient() === null)(
      "ingestCardContext: when client available, approved requirements/facts are ingested and searchable",
      async () => {
        const { projectId, cardId } = setupCardHierarchy(sqliteDb);

        sqliteDb.insertCardRequirement({
          id: crypto.randomUUID(),
          card_id: cardId,
          text: "Requirement one for card context",
          status: "approved",
          source: "user",
          position: 0,
        });
        sqliteDb.insertCardFact({
          id: crypto.randomUUID(),
          card_id: cardId,
          text: "Fact one for card context",
          status: "approved",
          source: "user",
          position: 0,
        });
        sqliteDb.insertCardRequirement({
          id: crypto.randomUUID(),
          card_id: cardId,
          text: "Draft requirement",
          status: "draft",
          source: "user",
          position: 1,
        });

        const count = await ingestCardContext(sqliteDb, cardId, projectId);
        expect(count).toBeGreaterThan(0);

        const relations = await sqliteDb.getMemoryUnitRelationsByEntity("card", cardId);
        const memoryIds = relations.map((r) => r.memory_unit_id as string);
        for (const mid of memoryIds) insertedIds.push(mid);

        const vec = await import("@/lib/memory/embedding").then((m) => m.embedText("Requirement one for card context"));
        const client = getRuvectorClient();
        expect(client).not.toBeNull();
        const results = await client!.search({ vector: vec, k: 10 });
        expect(results.length).toBeGreaterThan(0);
      }
    );
  });
});
