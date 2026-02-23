/**
 * Retrieval policy tests (M8).
 * Mock path: uses mock MemoryStore (RuVector unavailable) - returns empty.
 * Integration path: real SQLite + RuVector when available.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { retrieveForCard } from "@/lib/memory/retrieval";
import { createMockDbAdapter } from "../mock-db-adapter";
import { resetMemoryStoreForTesting } from "@/lib/memory";
import { createSqliteAdapter } from "@/lib/db/sqlite-adapter";
import { ingestMemoryUnit } from "@/lib/memory/ingestion";
import { getRuvectorClient } from "@/lib/ruvector/client";
import { resetRuvectorForTesting } from "@/lib/ruvector/client";
import { cleanupRuvectorTestVectors } from "../ruvector-test-helpers";

vi.mock("@/lib/ruvector/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/ruvector/client")>();
  return { ...mod, getRuvectorClient: vi.fn() };
});

const ruvectorAvailable = (() => {
  try {
    return require("ruvector-core") != null;
  } catch {
    return false;
  }
})();

const sqliteAvailable = (() => {
  try {
    const Database = require("better-sqlite3");
    new Database(":memory:").close();
    return true;
  } catch {
    return false;
  }
})();

describe("Retrieval policy (M8)", () => {
  beforeEach(() => {
    resetMemoryStoreForTesting();
    vi.mocked(getRuvectorClient).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when using mock store", async () => {
    const db = createMockDbAdapter();
    const refs = await retrieveForCard(db, "c1", "p1", "context summary");
    expect(refs).toEqual([]);
  });

  it("accepts limit option", async () => {
    const db = createMockDbAdapter();
    const refs = await retrieveForCard(db, "c1", "p1", "context", { limit: 5 });
    expect(refs).toEqual([]);
  });

  describe.skipIf(!ruvectorAvailable || !sqliteAvailable)("integration with real RuVector", () => {
    let realGetRuvectorClient: typeof getRuvectorClient;
    let sqliteDb: ReturnType<typeof createSqliteAdapter>;
    let tmpDir: string;
    const insertedIds: string[] = [];

    beforeAll(async () => {
      const mod = await vi.importActual<typeof import("@/lib/ruvector/client")>("@/lib/ruvector/client");
      realGetRuvectorClient = mod.getRuvectorClient;
    });

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dossier-retrieval-test-"));
      process.env.DOSSIER_DATA_DIR = tmpDir;
      resetMemoryStoreForTesting();
      resetRuvectorForTesting();
      vi.mocked(getRuvectorClient).mockImplementation(realGetRuvectorClient);
      sqliteDb = createSqliteAdapter(":memory:");
    });

    afterEach(async () => {
      const client = getRuvectorClient();
      if (client) await cleanupRuvectorTestVectors(insertedIds, client);
      insertedIds.length = 0;
      delete process.env.DOSSIER_DATA_DIR;
    });

    it("retrieveForCard end-to-end: when client available, ingest then retrieve returns relevant results", async () => {
      const cardId = "retrieval-test-card";
      const projectId = "retrieval-test-project";

      const id = await ingestMemoryUnit(
        sqliteDb,
        { contentText: "User authentication must support OAuth2 and SSO", title: "Auth requirement" },
        { cardId, projectId }
      );
      expect(id).not.toBeNull();
      if (!id) return;
      insertedIds.push(id);

      const refs = await retrieveForCard(
        sqliteDb,
        cardId,
        projectId,
        "how does login work with OAuth"
      );
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some((s) => s.includes("OAuth2") || s.includes("authentication"))).toBe(true);
    });
  });
});
