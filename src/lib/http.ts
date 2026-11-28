import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ZodError, ZodType } from "zod";
import { db, schema } from "@/db";
import {
  STAFF_COOKIE, REFRESH_AFTER_SECONDS, cookieHeader, signStaff, verifyStaffToken,
  verifyCustomerToken,
} from "@/lib/auth/session";
import { type Permission, type PiiAccessLevel, type Role } from "@/lib/rbac";
import { resolveStaffAccess } from "@/lib/rbac-server";
import { rateLimit } from "@/lib/ratelimit";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (m: string, d?: unknown) => new ApiError(400, m, d);
export const unauthorized = (m = "Not signed in") => new ApiError(401, m);
export const forbidden = (m = "You do not have permission to do this") => new ApiError(403, m);
export const notFound = (m = "Not found") => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);

/**
 * Client IP for rate limiting and audit logs. X-Forwarded-For can be forged by the caller, so we
 * only trust values added by OUR proxy: the platform's own header when present, otherwise the
 * entry `TRUSTED_PROXY_HOPS` places from the right (default 1 = the last proxy we sit behind).
 */
export function getIp(req: Request): string | null {
  const h = req.headers;
  // Only trust a platform header when the operator names it (CLIENT_IP_HEADER): a client can send any
  // header itself unless the host strips/overwrites it. Netlify: x-nf-client-connection-ip. Vercel: x-vercel-forwarded-for.
  const named = process.env.CLIENT_IP_HEADER?.toLowerCase();
  const platform = named ? h.get(named) : null;
  if (platform) return platform.split(",")[0].trim();
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (chain.length) return chain[Math.max(0, chain.length - hops)] ?? null;
  return h.get("x-real-ip");
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

export function handleError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }

  // Gracefully handle PostgreSQL connection failures
  if (isConnError(e)) {
    console.warn("DATABASE CONNECTION FAILURE:", String((e as { message?: string })?.message || e));
    return NextResponse.json({
      error: "Database service unavailable",
      code: "DATABASE_UNAVAILABLE",
      message: "Cannot connect to the PostgreSQL database. Please ensure PostgreSQL is running (e.g. `npm run docker:up` or native Postgres on port 5432) or check DATABASE_URL in .env.local.",
    }, { status: 503 });
  }

  console.error("UNHANDLED API ERROR", e);
  return NextResponse.json({ error: "Something went wrong on our side" }, { status: 500 });
}

export async function parseBody<T>(req: Request, schemaZ: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw badRequest("Request body must be valid JSON"); }
  return schemaZ.parse(raw);
}
export function parseQuery<T>(req: NextRequest, schemaZ: ZodType<T>): T {
  return schemaZ.parse(Object.fromEntries(req.nextUrl.searchParams));
}

// ---------------------------------------------------------------- staff (admin) routes
export type StaffUser = {
  id: string; name: string; email: string; role: Role; piiAccessLevel?: PiiAccessLevel;
};

/** Reads the staff session cookie and confirms the account is still active. */
export async function currentStaff(): Promise<{ staff: StaffUser; issuedAt: number } | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  const claims = await verifyStaffToken(token);
  if (!claims) return null;
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, claims.sub));
  if (!row || !row.active || row.tokenVersion !== claims.tv) return null;
  return {
    staff: { id: row.id, name: row.name, email: row.email, role: row.role },
    issuedAt: claims.iat,
  };
}

type AdminCtx = { req: NextRequest; staff: StaffUser; params: Record<string, string> };

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients and same-origin GETs
  try {
    const originHost = new URL(origin).host;
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return originHost === host;
  } catch {
    return false;
  }
}

export function adminRoute(
  perm: Permission | null,
  handler: (ctx: AdminCtx) => Promise<Response | object | null>,
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      // CSRF: reject cross-site state-changing requests (cookie is also SameSite=Lax)
      if (req.method !== "GET" && !sameOrigin(req)) throw forbidden("Cross-site request blocked");
      const session = await currentStaff();
      if (!session) throw unauthorized();
      const access = await resolveStaffAccess(session.staff.id, session.staff.role);
      if (perm && !access.permissions.includes(perm)) throw forbidden();
      const staffWithPrivacy: StaffUser = { ...session.staff, piiAccessLevel: access.piiAccessLevel };
      const result = await handler({ req, staff: staffWithPrivacy, params: await ctx.params });
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      // sliding session: keep active users signed in, idle users get timed out
      if (Math.floor(Date.now() / 1000) - session.issuedAt > REFRESH_AFTER_SECONDS) {
        const ttlSeconds = Math.max(300, access.sessionTtlMinutes * 60);
        res.headers.append("Set-Cookie", cookieHeader(STAFF_COOKIE, await signStaff(session.staff.id, await getTv(session.staff.id)), ttlSeconds));
      }
      return res;
    } catch (e) { return handleError(e); }
  };
}
async function getTv(id: string) {
  const [r] = await db.select({ tv: schema.staff.tokenVersion }).from(schema.staff).where(eq(schema.staff.id, id));
  return r?.tv ?? 0;
}

// ---------------------------------------------------------------- public API (/api/v1)
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
export const preflight = (req: Request) => new NextResponse(null, { status: 204, headers: corsHeaders(req) });

type PublicCtx = { req: NextRequest; params: Record<string, string> };
type CustomerCtx = PublicCtx & { customer: { id: string; email: string; fullName: string } };

function withCors(res: Response, req: Request) {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}

/** Public route. `limit` is requests per minute per IP. */
export function publicRoute(
  handler: (ctx: PublicCtx) => Promise<Response | object>,
  opts: { limit?: number; name: string } = { name: "public" },
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      if (opts.limit) {
        const ok = await rateLimit(`pub:${opts.name}:${getIp(req) ?? "?"}`, opts.limit, 60);
        if (!ok) throw new ApiError(429, "Too many requests, please slow down");
      }
      const result = await handler({ req, params: await ctx.params });
      return withCors(result instanceof Response ? result : NextResponse.json(result), req);
    } catch (e) { return withCors(handleError(e), req); }
  };
}

/** Route that needs a signed-in customer (Bearer token issued by /api/v1/auth/login). */
export function customerRoute(
  handler: (ctx: CustomerCtx) => Promise<Response | object>,
  opts: { limit?: number; name: string },
) {
  return publicRoute(async (ctx) => {
    const header = ctx.req.headers.get("authorization") ?? "";
    const claims = await verifyCustomerToken(header.startsWith("Bearer ") ? header.slice(7) : null);
    if (!claims) throw unauthorized();
    const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, claims.sub));
    if (!c || c.blocked || c.tokenVersion !== claims.tv) throw unauthorized();
    return handler({ ...ctx, customer: { id: c.id, email: c.email, fullName: c.fullName } });
  }, { limit: opts.limit ?? 120, name: opts.name });
}

/** Server-to-server routes (analytics ingestion etc.) guarded by a shared key. */
export function requireApiKey(req: Request) {
  const expected = process.env.PUBLIC_API_KEY;
  const given = req.headers.get("x-api-key");
  if (!expected || !given || given.length !== expected.length) throw unauthorized("Invalid API key");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  if (diff !== 0) throw unauthorized("Invalid API key");
}
