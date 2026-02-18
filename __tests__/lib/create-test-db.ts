/**
 * Test helper: in-memory SQLite DbAdapter with migrations applied.
 * Use for integration tests that need real DB behavior (transactions, constraints, etc.).
 * Replaces createMockDbAdapter() when you need actual SQLite semantics.
 *
 * @example
 *   const db = createTestDb();
 *   await db.insertProject({ id: "p1", name: "Test", ... });
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { createSqliteAdapter } from "@/lib/db/sqlite-adapter";

/**
 * Creates an in-memory SQLite adapter, runs migrations, and returns the DbAdapter.
 * Each call returns a fresh isolated database.
 */
export function createTestDb(): DbAdapter {
  return createSqliteAdapter(":memory:");
}
