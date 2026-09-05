import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

if (!process.env.POSTGRES_URL) {
  throw new Error(
    "POSTGRES_URL environment variable is not set. Please configure it in your environment.",
  );
}

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, {
  schema,
  casing: "snake_case",
});

export default db;

export { db };
