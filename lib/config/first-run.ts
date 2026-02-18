/**
 * First-run initialization.
 * Creates a default project if none exist.
 * Idempotent — safe to call on every startup.
 */

import { getDb } from "@/lib/db";

let _initialized = false;

export async function ensureFirstRunComplete(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    const db = getDb();
    const projects = await db.listProjects();
    if (projects.length > 0) return;

    const id = crypto.randomUUID();
    await db.insertProject({
      id,
      name: "My First Project",
      repo_url: null,
      default_branch: "main",
    });

    console.log(`  Created default project: ${id}`);
  } catch (err) {
    console.error("First-run initialization failed:", err);
  }
}
