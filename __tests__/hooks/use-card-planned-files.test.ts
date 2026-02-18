import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCardPlannedFiles } from "@/lib/hooks/use-card-planned-files";

describe("useCardPlannedFiles", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches planned files when projectId and cardId are set", async () => {
    const files = [
      {
        id: "pf1",
        card_id: "c1",
        logical_file_name: "src/App.tsx",
        action: "create",
        purpose: "Main component",
        status: "proposed",
      },
    ];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(files),
    } as Response);

    const { result } = renderHook(() => useCardPlannedFiles("p1", "c1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(files);
    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/projects/p1/cards/c1/planned-files");
  });

  it("returns empty array when response is 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useCardPlannedFiles("p1", "c1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Not found");
  });

  it("does not fetch when projectId or cardId is undefined", () => {
    renderHook(() => useCardPlannedFiles(undefined, "c1"));
    expect(fetch).not.toHaveBeenCalled();

    vi.clearAllMocks();
    renderHook(() => useCardPlannedFiles("p1", undefined));
    expect(fetch).not.toHaveBeenCalled();
  });
});
