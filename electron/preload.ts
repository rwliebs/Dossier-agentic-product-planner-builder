/**
 * Minimal preload script for Dossier Electron app.
 * Exposes contextBridge APIs for future native integrations (file dialogs, etc.).
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Placeholder for future native APIs (e.g. openFileDialog, showNotification)
  platform: process.platform,
});
