/**
 * Historical snapshots tests (M8).
 * Mock path: tests pass without RuVector.
 * Integration path: real RuVector when available.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appendCardSnapshot } from "@/lib/memory/snapshots";
import { getRuvectorClient } from "@/lib/ruvector/client";
import {
  ruvectorAvailable,
  createTestRuvectorClient,
  cleanupRuvectorTestVectors,
} from "@/__tests__/lib/ruvector-test-helpers";

vi.mock("@/lib/ruvector/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/ruvector/client")>();
  return { ...mod, getRuvectorClient: vi.fn() };
});

describe("Snapshots (M8)", () => {
  beforeEach(() => {
    vi.mocked(getRuvectorClient).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when RuVector unavailable", async () => {
    const result = await appendCardSnapshot({
      cardId: "c1",
      projectId: "p1",
      title: "Card",
      description: "Desc",
      eventType: "build_completed",
      buildOutcome: "success",
    });
    expect(result).toBe(false);
  });

  it("returns false for empty text", async () => {
    vi.mocked(getRuvectorClient).mockReturnValue(null);
    const result = await appendCardSnapshot({
      cardId: "c1",
      projectId: "p1",
      eventType: "status_transition",
    });
    expect(result).toBe(false);
  });

  describe.skipIf(!ruvectorAvailable)("integration with real RuVector", () => {
    const insertedIds: string[] = [];

    beforeEach(() => {
      const client = createTestRuvectorClient();
      vi.mocked(getRuvectorClient).mockReturnValue(client);
    });

    afterEach(async () => {
      const client = getRuvectorClient();
      if (client) await cleanupRuvectorTestVectors(insertedIds, client);
      insertedIds.length = 0;
    });

    it("appendCardSnapshot: returns true, namespaced ID is in RuVector", async () => {
      const cardId = "snapshot-test-card";
      const result = await appendCardSnapshot({
        cardId,
        projectId: "p1",
        title: "Test Card",
        description: "Test description",
        eventType: "build_completed",
        buildOutcome: "success",
      });
      expect(result).toBe(true);

      const client = getRuvectorClient();
      expect(client).not.toBeNull();
      // Use same text format as appendCardSnapshot builds (parts.join("\n"))
      const searchText = [
        "Test Card",
        "Test description",
        "event: build_completed",
        "outcome: success",
      ].join("\n");
      const vec = await import("@/lib/memory/embedding").then((m) =>
        m.embedText(searchText)
      );
      const results = await client!.search({ vector: vec, k: 5 });
      expect(results.length).toBeGreaterThan(0);
      const snapshotResult = results.find((r) => r.id.startsWith("snapshot:card:"));
      expect(snapshotResult).toBeDefined();
      expect(snapshotResult!.id).toContain(`snapshot:card:${cardId}`);
      if (snapshotResult) insertedIds.push(snapshotResult.id);
    });
  });
});
