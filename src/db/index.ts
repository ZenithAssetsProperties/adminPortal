import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __pool?: Pool;
  __db?: NodePgDatabase<typeof schema>;
};

export function getPool(): Pool {
  if (globalForDb.__pool) return globalForDb.__pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Please define DATABASE_URL in your .env.local file (see .env.example) or environment variables."
    );
  }
  const pool = new Pool({
    connectionString: url,
    max: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Supabase and most hosted Postgres need SSL; local Docker does not.
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  globalForDb.__pool = pool;
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (globalForDb.__db) return globalForDb.__db;
  const pool = getPool();
  const instance = drizzle(pool, { schema });
  globalForDb.__db = instance;
  return instance;
}

/**
 * Lazy-initialized database instance.
 * Allows module graph compilation and static analysis without throwing top-level
 * exceptions when DATABASE_URL has not yet been loaded.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const val = Reflect.get(instance as unknown as object, prop, receiver);
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

export { schema };
export type DB = NodePgDatabase<typeof schema>;
