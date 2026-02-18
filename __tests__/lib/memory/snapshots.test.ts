/**
 * Historical snapshots tests (M8).
 * Mocks getRuvectorClient to return null so tests pass without RuVector.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appendCardSnapshot } from "@/lib/memory/snapshots";

vi.mock("@/lib/ruvector/client", () => ({
  getRuvectorClient: vi.fn(),
}));

import { getRuvectorClient } from "@/lib/ruvector/client";

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
});
