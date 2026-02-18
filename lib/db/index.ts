/**
 * Database adapter factory.
 * Reads DB_DRIVER env var: "sqlite" (default) or "postgres".
 * SQLite: uses DOSSIER_DATA_DIR or ~/.dossier/dossier.db
 * Postgres: uses DATABASE_URL (when DB_DRIVER=postgres)
 */

import type { DbAdapter } from "./adapter";
import { createSqliteAdapter } from "./sqlite-adapter";
import { getSqlitePath } from "@/lib/config/data-dir";

let _adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (_adapter) return _adapter;

  const driver = process.env.DB_DRIVER ?? "sqlite";

  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DB_DRIVER=postgres requires DATABASE_URL to be set");
    }
    throw new Error(
      "Postgres adapter not yet implemented. Use DB_DRIVER=sqlite (default) for local development."
    );
  }

  _adapter = createSqliteAdapter(getSqlitePath());
  return _adapter;
}

/** For tests: reset the singleton and optionally use in-memory DB */
export function resetDbForTesting(inMemory = true): DbAdapter {
  _adapter = null;
  const adapter = createSqliteAdapter(inMemory ? ":memory:" : getSqlitePath());
  _adapter = adapter;
  return adapter;
}
