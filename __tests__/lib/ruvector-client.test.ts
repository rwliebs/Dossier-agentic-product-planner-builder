/**
 * RuVector client tests (M1).
 * Verifies embed + search cycle. Skips when native module unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getRuvectorClient,
  getRuvectorDataDir,
  isRuvectorAvailable,
  resetRuvectorForTesting,
} from "@/lib/ruvector/client";

const ruvectorAvailable = (() => {
  try {
    return require("ruvector-core") != null;
  } catch {
    return false;
  }
})();

describe("RuVector client (M1)", () => {
  beforeAll(() => {
    resetRuvectorForTesting();
  });
  afterAll(() => {
    resetRuvectorForTesting();
  });

  describe("getRuvectorDataDir", () => {
    it("returns path under .dossier when DOSSIER_DATA_DIR unset", () => {
      const dir = getRuvectorDataDir();
      expect(dir).toContain(".dossier");
      expect(dir).toContain("ruvector");
    });
  });

  describe("isRuvectorAvailable", () => {
    it("returns boolean", () => {
      expect(typeof isRuvectorAvailable()).toBe("boolean");
    });
  });

  describe.skipIf(!ruvectorAvailable)("embed + search cycle", () => {
    it.skipIf(() => getRuvectorClient() === null)(
      "inserts vector and finds it via search",
      async () => {
        const client = getRuvectorClient();
        if (!client) return;
        const dims = parseInt(process.env.RUVECTOR_DIMENSIONS ?? "384", 10);
        const vec = new Float32Array(dims).fill(0.5);
        const id = await client.insert({ id: "ruvector-test-doc", vector: vec });
        expect(id).toBe("ruvector-test-doc");
        const results = await client.search({ vector: vec, k: 5 });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe("ruvector-test-doc");
        expect(typeof results[0].score).toBe("number");
        await client.delete("ruvector-test-doc");
      },
    );
  });
});
