import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCardKnowledge } from "@/lib/hooks/use-card-knowledge";

describe("useCardKnowledge", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches knowledge when projectId and cardId are set", async () => {
    const requirements = [{ id: "r1", card_id: "c1", title: "Req 1", status: "approved" }];
    const facts = [{ id: "f1", card_id: "c1", content: "Fact 1", status: "approved" }];
    const assumptions: unknown[] = [];
    const questions: unknown[] = [];

    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(requirements) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(facts) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(assumptions) } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(questions) } as Response);

    const { result } = renderHook(() => useCardKnowledge("p1", "c1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ requirements, facts, assumptions, questions });
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when projectId or cardId is undefined", () => {
    renderHook(() => useCardKnowledge(undefined, "c1"));
    expect(fetch).not.toHaveBeenCalled();

    vi.clearAllMocks();
    renderHook(() => useCardKnowledge("p1", undefined));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets error when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useCardKnowledge("p1", "c1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Network error");
  });
});
