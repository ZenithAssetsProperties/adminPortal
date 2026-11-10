import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PENDING_COOKIE, STAFF_COOKIE, STAFF_IDLE_SECONDS, cookieOptions, signStaff, verifyPendingToken, verifyStaffToken } from "@/lib/auth/session";
import { unauthorized } from "@/lib/http";

export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
/** Admins and finance (who can record payments) must use two-step login (PRD §33); other roles may opt in. */
export const requires2fa = (role: string) => role === "super_admin" || role === "admin" || role === "finance";

/** The staff member behind a pending (password-ok, code-not-yet-entered) or full session cookie. */
export async function staffFromPendingOrSession() {
  const jar = await cookies();
  const pending = await verifyPendingToken(jar.get(PENDING_COOKIE)?.value);
  const full = pending ? null : await verifyStaffToken(jar.get(STAFF_COOKIE)?.value);
  const claims = pending ?? full;
  if (!claims) throw unauthorized();
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, claims.sub));
  if (!row || !row.active || row.tokenVersion !== claims.tv) throw unauthorized();
  return { row, pending: Boolean(pending) };
}

export async function startFullSession(staffId: string, tv: number) {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, await signStaff(staffId, tv), cookieOptions(STAFF_IDLE_SECONDS));
  jar.delete(PENDING_COOKIE);
  await db.update(schema.staff).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(schema.staff.id, staffId));
}
