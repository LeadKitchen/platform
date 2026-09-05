import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Unified database type used across the codebase.
 *
 * The main application deliberately uses the transaction-capable
 * `node-postgres` driver against a self-hosted Postgres instance. Edge-only,
 * read-oriented code can import `dbEdge` from the package instead.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

function createDatabase(): Database {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "POSTGRES_URL environment variable is not set. Please configure it in your environment.",
    );
  }

  const pool = new Pool({ connectionString });
  return drizzlePg({ client: pool, schema, casing: "snake_case" });
}

export const db: Database = createDatabase();
