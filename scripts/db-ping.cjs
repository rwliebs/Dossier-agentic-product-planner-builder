/**
 * Ping the database using DATABASE_URL from .env.local. Postgres only.
 * Usage: pnpm db:ping  or  node scripts/db-ping.cjs
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

// Require format: postgresql://user:pass@HOST:port/db (so we can show host on error)
let parsedHost = null;
try {
  const u = new URL(DATABASE_URL.replace(/^postgresql:/, "https:"));
  parsedHost = u.hostname;
} catch (_) {}

async function ping() {
  const postgres = require("postgres");
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const result = await sql`SELECT 1 as ok, current_database() as db`;
    console.log("DB ping OK:", result[0]);
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error("DB ping failed:", err.message);
    if (parsedHost) console.error("Host used:", parsedHost);
    if (err.code === "ENOTFOUND" || err.message.includes("ENOTFOUND")) {
      console.error(
        "Fix: Supabase Dashboard → Project Settings → Database. Use the 'Session pooler' connection string (URI, Node.js) for DATABASE_URL."
      );
    }
    await sql.end().catch(() => {});
    process.exit(1);
  }
}

ping();
