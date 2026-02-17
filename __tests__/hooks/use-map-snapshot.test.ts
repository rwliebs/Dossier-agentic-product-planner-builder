import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMapSnapshot } from "@/lib/hooks/use-map-snapshot";

describe("useMapSnapshot", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns loading then data when projectId is set and fetch succeeds", async () => {
    const snapshot = {
      project: { id: "p1", name: "Test", repo_url: null, default_branch: "main" },
      workflows: [],
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(snapshot),
    } as Response);

    const { result } = renderHook(() => useMapSnapshot("p1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(snapshot);
    expect(result.current.error).toBeNull();
  });

  it("returns error when fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useMapSnapshot("p1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Project not found");
  });

  it("does not fetch when projectId is undefined", () => {
    const { result } = renderHook(() => useMapSnapshot(undefined));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
