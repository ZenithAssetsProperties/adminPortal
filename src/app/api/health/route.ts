import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let dbStatus = "unknown";
  let dbLatencyMs: number | null = null;
  let errorDetail: string | null = null;

  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1 as ping`);
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = "healthy";
  } catch (err) {
    dbStatus = "unreachable";
    errorDetail = String((err as { message?: string })?.message || err);
  }

  const isHealthy = dbStatus === "healthy";
  const status = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      services: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          error: errorDetail,
        },
        storage: {
          mode: process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID ? "s3-compatible" : "local-disk",
        },
        environment: process.env.NODE_ENV || "development",
      },
    },
    { status }
  );
}
