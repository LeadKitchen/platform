import { Pool } from "pg";

async function dropSchema() {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

  try {
    console.log("🗑️  Dropping database schema...");

    // Drop all tables in the public schema
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");

    console.log("✅ Database schema dropped successfully!");
  } catch (error) {
    console.error("❌ Error dropping schema:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

dropSchema();
