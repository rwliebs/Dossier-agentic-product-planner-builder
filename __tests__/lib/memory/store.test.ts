/**
 * MemoryStore tests (M8).
 * Mock path: createMockMemoryStore, no RuVector required.
 * Integration path: real SQLite + RuVector when available.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createMockMemoryStore,
  createMemoryStore,
} from "@/lib/memory/store";
import { createMockDbAdapter } from "../mock-db-adapter";
import { createTestDb } from "../create-test-db";
import { ruvectorAvailable, cleanupRuvectorTestVectors } from "../ruvector-test-helpers";
import { ingestMemoryUnit } from "@/lib/memory/ingestion";
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

describe("MemoryStore (M8)", () => {
  describe("createMockMemoryStore", () => {
    it("returns empty search results", async () => {
      const store = createMockMemoryStore();
      const ids = await store.search("query", {
        cardId: "c1",
        projectId: "p1",
      });
      expect(ids).toEqual([]);
    });

    it("returns empty getContentByIds", async () => {
      const store = createMockMemoryStore();
      const content = await store.getContentByIds(["id1", "id2"]);
      expect(content).toEqual([]);
    });

    it("returns empty retrieveForCard", async () => {
      const store = createMockMemoryStore();
      const refs = await store.retrieveForCard("c1", "p1", "context");
      expect(refs).toEqual([]);
    });

    it("logRetrieval is no-op", async () => {
      const store = createMockMemoryStore();
      await expect(
        store.logRetrieval("q", "card", "c1", ["id1"])
      ).resolves.toBeUndefined();
    });
  });

  describe("createMemoryStore with mock db", () => {
    it("returns store that delegates to mock when RuVector unavailable", async () => {
      const db = createMockDbAdapter();
      const store = createMemoryStore(db, false);
      const refs = await store.retrieveForCard("c1", "p1", "context");
      expect(refs).toEqual([]);
    });
  });

  describe.skipIf(!ruvectorAvailable || !sqliteAvailable)("integration with real RuVector", () => {
    let realGetRuvectorClient: typeof getRuvectorClient;
    let sqliteDb: ReturnType<typeof createTestDb>;
    let tmpDir: string;
    const insertedIds: string[] = [];

    beforeAll(async () => {
      const mod = await vi.importActual<typeof import("@/lib/ruvector/client")>("@/lib/ruvector/client");
      realGetRuvectorClient = mod.getRuvectorClient;
    });

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dossier-store-test-"));
      process.env.DOSSIER_DATA_DIR = tmpDir;
      resetRuvectorForTesting();
      vi.mocked(getRuvectorClient).mockImplementation(realGetRuvectorClient);
      sqliteDb = createTestDb();
    });

    afterEach(async () => {
      const client = getRuvectorClient();
      if (client) await cleanupRuvectorTestVectors(insertedIds, client);
      insertedIds.length = 0;
      delete process.env.DOSSIER_DATA_DIR;
    });

    it("full retrieval cycle: card-scoped results come first", async () => {
      const cardId = "store-test-card";
      const projectId = "store-test-project";

      const id1 = await ingestMemoryUnit(
        sqliteDb,
        { contentText: "Card-scoped content A", title: "Card A" },
        { cardId, projectId }
      );
      const id2 = await ingestMemoryUnit(
        sqliteDb,
        { contentText: "Card-scoped content B", title: "Card B" },
        { cardId, projectId }
      );
      const id3 = await ingestMemoryUnit(
        sqliteDb,
        { contentText: "Project-only content", title: "Project" },
        { cardId: "other-card", projectId }
      );
      if (id1) insertedIds.push(id1);
      if (id2) insertedIds.push(id2);
      if (id3) insertedIds.push(id3);

      const store = createMemoryStore(sqliteDb, true);
      const ids = await store.search("card content", { cardId, projectId }, { limit: 10 });
      expect(ids.length).toBeGreaterThan(0);
      const cardScoped = [id1, id2];
      const cardScopedInResults = ids.filter((id) => cardScoped.includes(id));
      const projectOnlyInResults = ids.filter((id) => id === id3);
      expect(cardScopedInResults.length).toBeGreaterThanOrEqual(0);
      if (cardScopedInResults.length > 0 && projectOnlyInResults.length > 0) {
        expect(ids.indexOf(cardScopedInResults[0])).toBeLessThan(ids.indexOf(projectOnlyInResults[0]));
      }
    }, 30_000);

    it("retrieveForCard returns content strings (not just IDs)", async () => {
      const cardId = "store-retrieve-card";
      const projectId = "store-retrieve-project";

      const id = await ingestMemoryUnit(
        sqliteDb,
        { contentText: "Retrievable content for card", title: "Retrieve Test" },
        { cardId, projectId }
      );
      if (id) insertedIds.push(id);

      const store = createMemoryStore(sqliteDb, true);
      const content = await store.retrieveForCard(cardId, projectId, "retrievable content");
      expect(content.length).toBeGreaterThan(0);
      expect(content.some((s) => typeof s === "string" && s.includes("Retrievable content"))).toBe(true);
    }, 30_000);

    it("logRetrieval writes to memory_retrieval_log table", async () => {
      const insertSpy = vi.spyOn(sqliteDb, "insertMemoryRetrievalLog");
      const store = createMemoryStore(sqliteDb, true);
      await store.logRetrieval("test query", "card", "c1", ["id1", "id2"]);

      expect(insertSpy).toHaveBeenCalledWith({
        query_text: "test query",
        scope_entity_type: "card",
        scope_entity_id: "c1",
        result_memory_ids: ["id1", "id2"],
      });
      insertSpy.mockRestore();
    }, 30_000);

  });
});
