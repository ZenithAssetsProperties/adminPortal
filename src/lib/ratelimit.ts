import { lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// In-memory fallback bucket for resilience when database connection is down or recovering
const memStore = new Map<string, { count: number; resetAt: number }>();

function memRateLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

type ErrorWithCause = {
  code?: string;
  message?: string;
  cause?: {
    code?: string;
    errors?: Array<{ code?: string }>;
  };
};

function isConnError(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorWithCause;
  if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND" || e.code === "ETIMEDOUT") return true;
  if (e.cause) {
    if (e.cause.code === "ECONNREFUSED" || e.cause.code === "ENOTFOUND" || e.cause.code === "ETIMEDOUT") return true;
    const causeStr = String(e.cause);
    if (causeStr.includes("ECONNREFUSED") || causeStr.includes("connect ECONNREFUSED")) return true;
    if (Array.isArray(e.cause.errors)) {
      if (e.cause.errors.some((inner) => inner?.code === "ECONNREFUSED" || String(inner).includes("ECONNREFUSED"))) return true;
    }
  }
  const str = String(e.message || err);
  return str.includes("ECONNREFUSED") || str.includes("DATABASE_URL is not set") || str.includes("connect ECONNREFUSED");
}

/**
 * Resilient rate limiter: uses Postgres as primary store across instances.
 * If database is unreachable or offline, falls back seamlessly to in-memory store
 * to ensure API stability without breaking requests.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  try {
    const [row] = await db
      .insert(schema.rateLimits)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: {
          count: sql`CASE WHEN ${schema.rateLimits.resetAt} < now() THEN 1 ELSE ${schema.rateLimits.count} + 1 END`,
          resetAt: sql`CASE WHEN ${schema.rateLimits.resetAt} < now() THEN ${resetAt.toISOString()}::timestamptz ELSE ${schema.rateLimits.resetAt} END`,
        },
      })
      .returning({ count: schema.rateLimits.count });
    return row.count <= limit;
  } catch (err: unknown) {
    // If PostgreSQL connection fails (e.g. ECONNREFUSED), use memory fallback
    if (isConnError(err)) {
      return memRateLimit(key, limit, windowSeconds);
    }
    throw err;
  }
}

/**
 * Purge expired rate limits to keep the table compact and fast.
 */
export async function cleanupExpiredRateLimits(now = new Date()): Promise<number> {
  try {
    const res = await db.delete(schema.rateLimits).where(lt(schema.rateLimits.resetAt, now)).returning({ key: schema.rateLimits.key });
    return res.length;
  } catch {
    return 0;
  }
}
