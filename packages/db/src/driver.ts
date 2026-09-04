export type DbDriver = "node";

/**
 * Pure driver-selection logic, extracted so it can be unit tested without
 * triggering any database connection side effects.
 *
 * The main database client must support interactive transactions, so it
 * always uses `node-postgres` against a self-hosted Postgres instance.
 * Edge-only consumers use the explicit `dbEdge` export instead.
 */
export function selectDbDriver(
  _connectionString: string | undefined,
  _override: string | undefined = process.env.DB_DRIVER,
): DbDriver {
  return "node";
}
