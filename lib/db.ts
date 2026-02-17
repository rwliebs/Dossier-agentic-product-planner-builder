import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Set it in .env to use the Postgres client."
  );
}

const sql = postgres(connectionString);
export default sql;
