/**
 * Adapter contract tests (REMAINING_WORK_PLAN §3 Task D9).
 * Verifies DbAdapter CRUD and transaction behavior against SQLite in-memory.
 * Requires: pnpm rebuild better-sqlite3 (or pnpm approve-builds) - native module must be built.
 * If better-sqlite3 bindings are missing, run: pnpm rebuild better-sqlite3
 */

import { describe, it, expect } from "vitest";

let sqliteAvailable = false;
try {
  const Database = require("better-sqlite3");
  new Database(":memory:").close();
  sqliteAvailable = true;
} catch {
  // Native module not built - skip tests
}

describe.skipIf(!sqliteAvailable)("SQLite adapter contract", () => {
  it("inserts and retrieves project", async () => {
    const { createSqliteAdapter } = await import("@/lib/db/sqlite-adapter");
    const db = createSqliteAdapter(":memory:");

    const id = crypto.randomUUID();
    await db.insertProject({
      id,
      name: "Test Project",
      repo_url: null,
      default_branch: "main",
    });

    const project = await db.getProject(id);
    expect(project).not.toBeNull();
    expect((project as { name: string }).name).toBe("Test Project");
  });

  it("lists projects", async () => {
    const { createSqliteAdapter } = await import("@/lib/db/sqlite-adapter");
    const db = createSqliteAdapter(":memory:");

    const projects = await db.listProjects();
    expect(Array.isArray(projects)).toBe(true);
  });

  it("runs transaction with commit", async () => {
    const { createSqliteAdapter } = await import("@/lib/db/sqlite-adapter");
    const db = createSqliteAdapter(":memory:");

    const id = crypto.randomUUID();
    await db.transaction(async (adapter) => {
      await adapter.insertProject({
        id,
        name: "Tx Project",
        repo_url: null,
        default_branch: "main",
      });
    });

    const project = await db.getProject(id);
    expect(project).not.toBeNull();
    expect((project as { name: string }).name).toBe("Tx Project");
  });

  it("rolls back transaction on error", async () => {
    const { createSqliteAdapter } = await import("@/lib/db/sqlite-adapter");
    const db = createSqliteAdapter(":memory:");

    const id = crypto.randomUUID();
    try {
      await db.transaction(async (adapter) => {
        await adapter.insertProject({
          id,
          name: "Rollback Project",
          repo_url: null,
          default_branch: "main",
        });
        throw new Error("Intentional rollback");
      });
    } catch {
      // expected
    }

    const project = await db.getProject(id);
    expect(project).toBeNull();
  });
});
