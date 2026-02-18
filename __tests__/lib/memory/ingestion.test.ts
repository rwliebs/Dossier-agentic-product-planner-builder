/**
 * Ingestion pipeline tests (M8).
 * Mocks getRuvectorClient so tests pass without RuVector.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ingestMemoryUnit, ingestCardContext } from "@/lib/memory/ingestion";
import { createMockDbAdapter } from "../mock-db-adapter";

vi.mock("@/lib/ruvector/client", () => ({
  getRuvectorClient: vi.fn(),
}));

import { getRuvectorClient } from "@/lib/ruvector/client";

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
});
