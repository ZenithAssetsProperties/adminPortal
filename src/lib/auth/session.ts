import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();
function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return encoder.encode(s);
}

export const STAFF_COOKIE = "zs_staff";
export const STAFF_IDLE_SECONDS = 30 * 60; // automatic session timeout
export const REFRESH_AFTER_SECONDS = 5 * 60;

export type StaffClaims = { sub: string; tv: number; kind: "staff" };
export type CustomerClaims = { sub: string; tv: number; kind: "customer" };

async function sign(claims: Record<string, unknown>, seconds: number) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(key());
}

async function verify<T>(token: string | undefined | null): Promise<(T & { iat: number }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload as unknown as T & { iat: number };
  } catch {
    return null;
  }
}

export const signStaff = (id: string, tv: number) => sign({ sub: id, tv, kind: "staff" }, STAFF_IDLE_SECONDS);
export const signCustomer = (id: string, tv: number) => sign({ sub: id, tv, kind: "customer" }, 7 * 24 * 3600);

export async function verifyStaffToken(token?: string | null) {
  const c = await verify<StaffClaims>(token);
  return c && c.kind === "staff" ? c : null;
}
export async function verifyCustomerToken(token?: string | null) {
  const c = await verify<CustomerClaims>(token);
  return c && c.kind === "customer" ? c : null;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Builds a Set-Cookie header value (for plain Response objects). */
export function cookieHeader(name: string, value: string, maxAge: number) {
  const o = cookieOptions(maxAge);
  return `${name}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`;
}
