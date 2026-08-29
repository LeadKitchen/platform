import { Pool } from "pg";

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL environment variable is not set");
}

const pool = new Pool({
  connectionString: connectionString.replace(":6543", ":5432"),
});

try {
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "game_sessions_coaching_path_assignment_idx"
    ON "game_sessions" USING btree ("coaching_path_assignment_id")
  `);
} finally {
  await pool.end();
}
