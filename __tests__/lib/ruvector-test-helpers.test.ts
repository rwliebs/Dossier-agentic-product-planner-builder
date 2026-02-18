/**
 * Tests for ruvector-test-helpers.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  ruvectorAvailable,
  cleanupRuvectorTestVectors,
  createTestRuvectorClient,
} from "./ruvector-test-helpers";
import { DEFAULT_DIMENSIONS } from "@/lib/memory/embedding";

describe("ruvector-test-helpers", () => {
  describe("ruvectorAvailable", () => {
    it("is a boolean", () => {
      expect(typeof ruvectorAvailable).toBe("boolean");
    });
  });

  describe("createTestRuvectorClient", () => {
    it("returns null when ruvector unavailable", () => {
      // When unavailable, createTestRuvectorClient returns null
      const client = createTestRuvectorClient();
      if (!ruvectorAvailable) {
        expect(client).toBeNull();
      }
    });
  });

  describe.skipIf(!ruvectorAvailable)("integration with ruvector-core", () => {
    let client: NonNullable<ReturnType<typeof createTestRuvectorClient>>;
    const insertedIds: string[] = [];

    beforeAll(() => {
      const c = createTestRuvectorClient();
      expect(c).not.toBeNull();
      client = c!;
    });

    afterEach(async () => {
      await cleanupRuvectorTestVectors(insertedIds, client);
      insertedIds.length = 0;
    });

    it("createTestRuvectorClient returns working client", async () => {
      const vec = new Float32Array(DEFAULT_DIMENSIONS).fill(0.5);
      const id = "ruvector-helper-test-1";
      await client.insert({ id, vector: vec });
      insertedIds.push(id);
      const results = await client.search({ vector: vec, k: 5 });
      expect(results.some((r) => r.id === id)).toBe(true);
    });

    it("cleanupRuvectorTestVectors removes vectors", async () => {
      const vec = new Float32Array(DEFAULT_DIMENSIONS).fill(0.3);
      const id = "ruvector-helper-test-2";
      await client.insert({ id, vector: vec });
      insertedIds.push(id);
      await cleanupRuvectorTestVectors([id], client);
      const results = await client.search({ vector: vec, k: 5 });
      expect(results.some((r) => r.id === id)).toBe(false);
    });
  });
});
