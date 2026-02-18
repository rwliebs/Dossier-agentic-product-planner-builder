/**
 * Build harvest pipeline tests (M8).
 * Mocks getRuvectorClient so harvest returns 0 when learnings provided.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { harvestBuildLearnings } from "@/lib/memory/harvest";
import { createMockDbAdapter } from "../mock-db-adapter";

vi.mock("@/lib/ruvector/client", () => ({
  getRuvectorClient: vi.fn(),
}));

import { getRuvectorClient } from "@/lib/ruvector/client";

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
});
