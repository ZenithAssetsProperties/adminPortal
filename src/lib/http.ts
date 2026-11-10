import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ZodError, ZodType } from "zod";
import { db, schema } from "@/db";
import {
  STAFF_COOKIE, REFRESH_AFTER_SECONDS, STAFF_IDLE_SECONDS, cookieHeader, signStaff, verifyStaffToken,
  verifyCustomerToken,
} from "@/lib/auth/session";
import { can, type Permission, type Role } from "@/lib/rbac";
import { rateLimit } from "@/lib/ratelimit";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (m: string, d?: unknown) => new ApiError(400, m, d);
export const unauthorized = (m = "Not signed in") => new ApiError(401, m);
export const forbidden = (m = "You do not have permission to do this") => new ApiError(403, m);
export const notFound = (m = "Not found") => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);

export const getIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;

export function handleError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
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
  id: string; name: string; email: string; role: Role; totpEnabled: boolean;
};

/** Reads the staff session cookie and confirms the account is still active. */
export async function currentStaff(): Promise<{ staff: StaffUser; issuedAt: number } | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  const claims = await verifyStaffToken(token);
  if (!claims) return null;
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, claims.sub));
  if (!row || !row.active || row.tokenVersion !== claims.tv) return null;
  return {
    staff: { id: row.id, name: row.name, email: row.email, role: row.role, totpEnabled: row.totpEnabled },
    issuedAt: claims.iat,
  };
}

type AdminCtx = { req: NextRequest; staff: StaffUser; params: Record<string, string> };

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients and same-origin GETs
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
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
      if (perm && !can(session.staff.role, perm)) throw forbidden();
      const result = await handler({ req, staff: session.staff, params: await ctx.params });
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      // sliding session: keep active users signed in, idle users get timed out
      if (Math.floor(Date.now() / 1000) - session.issuedAt > REFRESH_AFTER_SECONDS) {
        res.headers.append("Set-Cookie", cookieHeader(STAFF_COOKIE, await signStaff(session.staff.id, await getTv(session.staff.id)), STAFF_IDLE_SECONDS));
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
