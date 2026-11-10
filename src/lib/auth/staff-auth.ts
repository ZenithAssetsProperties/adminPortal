import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { STAFF_COOKIE, STAFF_IDLE_SECONDS, cookieOptions, signStaff } from "@/lib/auth/session";

export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;

/** Sign the person in: sets the session cookie and clears any failed-login count. */
export async function startFullSession(staffId: string, tv: number) {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, await signStaff(staffId, tv), cookieOptions(STAFF_IDLE_SECONDS));
  await db.update(schema.staff).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(schema.staff.id, staffId));
}
