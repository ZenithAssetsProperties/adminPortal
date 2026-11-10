/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration-test helpers. These talk to a RUNNING app (default http://localhost:3100,
 * start it with `pnpm exec next dev -p 3100`) and the real database in DATABASE_URL.
 * Every helper creates uniquely-named data so tests can run repeatedly.
 */
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import { signCustomer, signStaff, STAFF_COOKIE } from "@/lib/auth/session";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3100";
export const uniq = () => randomUUID().slice(0, 8);

export async function makeStaff(role: "super_admin" | "admin" | "sales_agent" | "finance" | "content" = "admin") {
  const [s] = await db.insert(schema.staff).values({
    name: `Test ${role} ${uniq()}`, email: `t-${uniq()}@zenith.test`, role, passwordHash: "x",
  }).returning();
  return { ...s, cookie: `${STAFF_COOKIE}=${await signStaff(s.id, s.tokenVersion)}` };
}

export async function makeCustomer(over: Partial<typeof schema.customers.$inferInsert> = {}) {
  const [c] = await db.insert(schema.customers).values({
    fullName: `Test Customer ${uniq()}`, email: `c-${uniq()}@example.com`, phone: "08030000000", ...over,
  }).returning();
  return { ...c, token: await signCustomer(c.id, c.tokenVersion) };
}

export async function makeProperty(over: Partial<typeof schema.properties.$inferInsert> = {}) {
  const [p] = await db.insert(schema.properties).values({
    slug: `test-${uniq()}`, name: `Test Property ${uniq()}`, type: "house", state: "Lagos", city: "Lekki",
    priceKobo: 10_000_000_00, status: "available", ...over,
  }).returning();
  return p;
}

type Init = { method?: string; body?: unknown; headers?: Record<string, string> };
async function call(path: string, init: Init, headers: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...headers, ...init.headers },
    body: init.body === undefined ? undefined : init.body instanceof FormData ? init.body : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
export const asStaff = (cookie: string, path: string, init: Init = {}) => call(path, init, { Cookie: cookie });
export const asCustomer = (token: string, path: string, init: Init = {}) => call(path, init, { Authorization: `Bearer ${token}` });
export const anon = (path: string, init: Init = {}) => call(path, init, {});
