#!/usr/bin/env node

/**
 * Deletes all projects from the Dossier SQLite database (e.g. test projects).
 * Uses the same data dir as the app: DOSSIER_DATA_DIR or ~/.dossier.
 * DB file: dossier.db in that directory (or SQLITE_PATH env).
 *
 * Usage: node scripts/delete-test-projects.mjs
 *        SQLITE_PATH=/path/to/dossier.db node scripts/delete-test-projects.mjs
 */

import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function getDataDir() {
  const env = process.env.DOSSIER_DATA_DIR;
  if (env) return env;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".dossier");
}

function getSqlitePath() {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  const dir = getDataDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, "dossier.db");
}

const dbPath = getSqlitePath();
if (!existsSync(dbPath)) {
  console.log("No database found at", dbPath);
  process.exit(0);
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// Projects whose name contains "test" or "e2e" (case-insensitive)
const select = db.prepare(
  "SELECT id, name FROM project WHERE LOWER(name) LIKE '%test%' OR LOWER(name) LIKE '%e2e%'"
);
const toDelete = select.all();
if (toDelete.length === 0) {
  console.log("No projects with 'test' or 'e2e' in the title.");
  db.close();
  process.exit(0);
}

const deleteStmt = db.prepare("DELETE FROM project WHERE id = ?");
const run = db.transaction((rows) => {
  for (const row of rows) {
    deleteStmt.run(row.id);
  }
});
run(toDelete);
console.log(`Deleted ${toDelete.length} project(s) from ${dbPath}:`);
toDelete.forEach((r) => console.log(`  - ${r.name} (${r.id})`));
db.close();
