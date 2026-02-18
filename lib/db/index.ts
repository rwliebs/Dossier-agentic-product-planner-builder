/**
 * Database adapter factory.
 * Reads DB_DRIVER env var: "sqlite" (default) or "postgres".
 * SQLite: uses DOSSIER_DATA_DIR or ~/.dossier/dossier.db
 * Postgres: uses DATABASE_URL (when DB_DRIVER=postgres)
 */

import type { DbAdapter } from "./adapter";
import { createSqliteAdapter } from "./sqlite-adapter";
import * as path from "path";
import * as fs from "fs";

let _adapter: DbAdapter | null = null;

function getDataDir(): string {
  const env = process.env.DOSSIER_DATA_DIR;
  if (env) return env;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(home, ".dossier");
}

function getSqlitePath(): string {
  const dir = getDataDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(dir, "dossier.db");
}

export function getDb(): DbAdapter {
  if (_adapter) return _adapter;

  const driver = process.env.DB_DRIVER ?? "sqlite";

  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DB_DRIVER=postgres requires DATABASE_URL to be set");
    }
    // Postgres adapter - stub for now, throws
    throw new Error(
      "Postgres adapter not yet implemented. Use DB_DRIVER=sqlite (default) for local development."
    );
  }

  const dbPath = process.env.SQLITE_PATH ?? getSqlitePath();
  _adapter = createSqliteAdapter(dbPath);
  return _adapter;
}

/** For tests: reset the singleton and optionally use in-memory DB */
export function resetDbForTesting(inMemory = true): DbAdapter {
  _adapter = null;
  const adapter = createSqliteAdapter(inMemory ? ":memory:" : getSqlitePath());
  _adapter = adapter;
  return adapter;
}
