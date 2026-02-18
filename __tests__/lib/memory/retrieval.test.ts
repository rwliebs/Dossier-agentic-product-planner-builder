/**
 * Retrieval policy tests (M8).
 * Uses mock MemoryStore (RuVector unavailable) - returns empty.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { retrieveForCard } from "@/lib/memory/retrieval";
import { createMockDbAdapter } from "../mock-db-adapter";
import { resetMemoryStoreForTesting } from "@/lib/memory";

describe("Retrieval policy (M8)", () => {
  beforeEach(() => {
    resetMemoryStoreForTesting();
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
});
