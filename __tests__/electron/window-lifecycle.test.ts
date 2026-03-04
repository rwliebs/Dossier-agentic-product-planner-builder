import { describe, expect, it, vi } from "vitest";
import { handleActivateWindow } from "@/electron/window-lifecycle";

describe("electron activate window lifecycle", () => {
  it("recreates a window and loads app URL when server is ready", () => {
    const createWindow = vi.fn();
    const loadAppUrl = vi.fn();

    handleActivateWindow({
      windowCount: 0,
      isServerReady: true,
      createWindow,
      loadAppUrl,
    });

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(loadAppUrl).toHaveBeenCalledTimes(1);
  });

  it("recreates a window but keeps splash when server is not ready", () => {
    const createWindow = vi.fn();
    const loadAppUrl = vi.fn();

    handleActivateWindow({
      windowCount: 0,
      isServerReady: false,
      createWindow,
      loadAppUrl,
    });

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(loadAppUrl).not.toHaveBeenCalled();
  });

  it("does nothing when a window already exists", () => {
    const createWindow = vi.fn();
    const loadAppUrl = vi.fn();

    handleActivateWindow({
      windowCount: 1,
      isServerReady: true,
      createWindow,
      loadAppUrl,
    });

    expect(createWindow).not.toHaveBeenCalled();
    expect(loadAppUrl).not.toHaveBeenCalled();
  });
});
