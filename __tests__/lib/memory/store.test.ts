/**
 * MemoryStore tests (M8).
 * Uses createMockMemoryStore - no RuVector required.
 */

import { describe, it, expect } from "vitest";
import {
  createMockMemoryStore,
  createMemoryStore,
} from "@/lib/memory/store";
import { createMockDbAdapter } from "../mock-db-adapter";

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
});
