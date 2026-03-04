type HandleActivateOptions = {
  windowCount: number;
  isServerReady: boolean;
  createWindow: () => void;
  loadAppUrl: () => void;
};

/**
 * Handles macOS dock re-activation behavior.
 * Re-creates a window when none are open, and navigates it to the app URL
 * immediately if the embedded server is already ready.
 */
export function handleActivateWindow({
  windowCount,
  isServerReady,
  createWindow,
  loadAppUrl,
}: HandleActivateOptions): void {
  if (windowCount !== 0) return;
  createWindow();
  if (isServerReady) {
    loadAppUrl();
  }
}
