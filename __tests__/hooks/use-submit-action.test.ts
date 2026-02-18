import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSubmitAction } from "@/lib/hooks/use-submit-action";

describe("useSubmitAction", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits actions and returns result when projectId is set", async () => {
    const response = { applied: 1, results: [{ id: "r1", action_type: "updateCard", validation_status: "accepted" }] };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    } as Response);

    const { result } = renderHook(() => useSubmitAction("p1"));

    let submitResult: Awaited<ReturnType<typeof result.current.submit>>;
    await act(async () => {
      submitResult = await result.current.submit({
        actions: [{ action_type: "updateCard", target_ref: { card_id: "c1" }, payload: { description: "Updated" } }],
      });
    });

    expect(submitResult!).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/p1/actions",
      expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" } })
    );
  });

  it("returns null and sets error when fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "Validation failed" }),
    } as Response);

    const { result } = renderHook(() => useSubmitAction("p1"));

    let submitResult: Awaited<ReturnType<typeof result.current.submit>>;
    await act(async () => {
      submitResult = await result.current.submit({
        actions: [{ action_type: "updateCard", target_ref: { card_id: "c1" } }],
      });
    });

    expect(submitResult!).toBeNull();
    await waitFor(() => {
      expect(result.current.error).toBe("Validation failed");
    });
  });

  it("returns null when projectId is undefined", async () => {
    const { result } = renderHook(() => useSubmitAction(undefined));

    let submitResult: Awaited<ReturnType<typeof result.current.submit>>;
    await act(async () => {
      submitResult = await result.current.submit({
        actions: [{ action_type: "updateCard", target_ref: { card_id: "c1" } }],
      });
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(submitResult!).toBeNull();
    await waitFor(() => {
      expect(result.current.error).toBe("No project selected");
    });
  });
});
