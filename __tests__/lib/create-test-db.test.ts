/**
 * Tests for createTestDb helper.
 * Requires better-sqlite3 native bindings (pnpm rebuild better-sqlite3).
 */

import { describe, it, expect } from "vitest";
import { createTestDb } from "./create-test-db";

const sqliteAvailable = (() => {
  try {
    const Database = require("better-sqlite3");
    new Database(":memory:").close();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!sqliteAvailable)("createTestDb", () => {
  it("returns a DbAdapter with migrations applied", async () => {
    const db = createTestDb();
    const projects = await db.listProjects();
    expect(projects).toEqual([]);
  });

  it("each call returns a fresh isolated database", async () => {
    const db1 = createTestDb();
    const db2 = createTestDb();
    await db1.insertProject({
      id: "p1",
      name: "Project 1",
      repo_url: null,
      default_branch: "main",
    });
    const projects1 = await db1.listProjects();
    const projects2 = await db2.listProjects();
    expect(projects1).toHaveLength(1);
    expect(projects2).toHaveLength(0);
  });
});
