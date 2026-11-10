import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyCustomerToken } from "@/lib/auth/session";

type Customer = typeof schema.customers.$inferSelect;

/** Customer fields that are safe to send to the browser (never the password hash or token version). */
export function customerDto(c: Customer) {
  return {
    id: c.id, fullName: c.fullName, email: c.email, phone: c.phone,
    emailVerified: c.emailVerified, phoneVerified: c.phoneVerified, idVerified: c.idVerified,
    isDiaspora: c.isDiaspora, country: c.country, createdAt: c.createdAt,
  };
}

const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
};

export type PurposeKind = "pwreset" | "verify-email" | "verify-phone";

/** Signed, expiring, single-purpose token (cannot be used as a login session: kind differs). */
export async function signPurposeToken(kind: PurposeKind, claims: Record<string, unknown>, seconds: number) {
  return new SignJWT({ ...claims, kind }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${seconds}s`).sign(key());
}

export async function verifyPurposeToken<T extends Record<string, unknown>>(kind: PurposeKind, token: string): Promise<(T & { sub: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.kind !== kind || typeof payload.sub !== "string") return null;
    return payload as unknown as T & { sub: string };
  } catch { return null; }
}

export const signResetToken = (c: Pick<Customer, "id" | "tokenVersion">) => signPurposeToken("pwreset", { sub: c.id, tv: c.tokenVersion }, 3600);
export const signEmailToken = (c: Pick<Customer, "id" | "email">) => signPurposeToken("verify-email", { sub: c.id, email: c.email }, 48 * 3600);

// ---- phone OTP, stateless: the token holds an HMAC of the code, so nothing is stored server-side
const otpMac = (sub: string, phone: string, code: string) =>
  createHmac("sha256", process.env.SESSION_SECRET!).update(`${sub}|${phone}|${code}`).digest("hex");

export async function newPhoneOtp(c: Pick<Customer, "id">, phone: string) {
  const code = String(randomInt(100000, 1000000));
  const token = await signPurposeToken("verify-phone", { sub: c.id, phone, mac: otpMac(c.id, phone, code) }, 600);
  return { code, token };
}

export async function checkPhoneOtp(sub: string, phone: string, token: string, code: string): Promise<boolean> {
  const claims = await verifyPurposeToken<{ phone: string; mac: string }>("verify-phone", token);
  if (!claims || claims.sub !== sub || claims.phone !== phone || !/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(claims.mac); const b = Buffer.from(otpMac(sub, phone, code));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Where the main website lives; used to build links in emails. */
export function frontendUrl() {
  return (process.env.FRONTEND_URL ?? (process.env.ALLOWED_ORIGINS ?? "").split(",")[0] ?? "").trim().replace(/\/$/, "");
}

/** The signed-in customer if a valid Bearer token is present, otherwise null (for routes that work for guests too). */
export async function optionalCustomer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const claims = await verifyCustomerToken(h.startsWith("Bearer ") ? h.slice(7) : null);
  if (!claims) return null;
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, claims.sub));
  return c && !c.blocked && c.tokenVersion === claims.tv ? c : null;
}
