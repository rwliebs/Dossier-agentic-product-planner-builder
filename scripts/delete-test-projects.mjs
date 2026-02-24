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

const count = db.prepare("SELECT COUNT(*) as n FROM project").get();
if (count.n === 0) {
  console.log("No projects in database.");
  db.close();
  process.exit(0);
}

db.prepare("DELETE FROM project").run();
console.log(`Deleted ${count.n} project(s) from ${dbPath}.`);
db.close();
