/**
 * Next.js instrumentation hook — runs once on server startup.
 * Loads ~/.dossier/config into process.env and runs first-run setup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadConfigIntoEnv } = await import("@/lib/config/data-dir");
    loadConfigIntoEnv();

    const { ensureFirstRunComplete } = await import("@/lib/config/first-run");
    await ensureFirstRunComplete();
  }
}
