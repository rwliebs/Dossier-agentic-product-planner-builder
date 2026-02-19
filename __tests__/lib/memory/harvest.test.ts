/**
 * Build harvest pipeline tests (M8).
 * Mock path: tests pass without RuVector.
 * Integration path: real SQLite + RuVector when available.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { harvestBuildLearnings } from "@/lib/memory/harvest";
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

describe("Harvest pipeline (M8)", () => {
  beforeEach(() => {
    vi.mocked(getRuvectorClient).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 0 when learnings empty", async () => {
    const db = createMockDbAdapter();
    const count = await harvestBuildLearnings(db, {
      assignmentId: "a1",
      runId: "r1",
      cardId: "c1",
      projectId: "p1",
    });
    expect(count).toBe(0);
  });

  it("returns 0 when learnings undefined", async () => {
    const db = createMockDbAdapter();
    const count = await harvestBuildLearnings(db, {
      assignmentId: "a1",
      runId: "r1",
      cardId: "c1",
      projectId: "p1",
    });
    expect(count).toBe(0);
  });

  it("returns 0 when RuVector unavailable (learnings provided)", async () => {
    const db = createMockDbAdapter();
    const count = await harvestBuildLearnings(db, {
      assignmentId: "a1",
      runId: "r1",
      cardId: "c1",
      projectId: "p1",
      learnings: ["Learning 1", "Learning 2"],
    });
    expect(count).toBe(0);
  });

  it("skips empty/whitespace learnings", async () => {
    const db = createMockDbAdapter();
    const count = await harvestBuildLearnings(db, {
      assignmentId: "a1",
      runId: "r1",
      cardId: "c1",
      projectId: "p1",
      learnings: ["", "  ", "valid"],
    });
    expect(count).toBe(0);
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
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dossier-harvest-test-"));
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

    it("harvestBuildLearnings: ingests learnings, count > 0, vectors searchable", async () => {
      const count = await harvestBuildLearnings(sqliteDb, {
        assignmentId: "a1",
        runId: "r1",
        cardId: "c1",
        projectId: "p1",
        learnings: ["Build learning one", "Build learning two"],
      });
      expect(count).toBeGreaterThan(0);

      const relations = await sqliteDb.getMemoryUnitRelationsByEntity("card", "c1");
      for (const r of relations) insertedIds.push(r.memory_unit_id as string);

      const client = getRuvectorClient();
      expect(client).not.toBeNull();
      const vec = await import("@/lib/memory/embedding").then((m) => m.embedText("Build learning one"));
      const results = await client!.search({ vector: vec, k: 5 });
      expect(results.length).toBeGreaterThan(0);
    }, 30_000);

    it("skips empty/whitespace learnings (integration)", async () => {
      const count = await harvestBuildLearnings(sqliteDb, {
        assignmentId: "a1",
        runId: "r1",
        cardId: "c1",
        projectId: "p1",
        learnings: ["", "  ", "\t", "\n"],
      });
      expect(count).toBe(0);
    });
  });
});
