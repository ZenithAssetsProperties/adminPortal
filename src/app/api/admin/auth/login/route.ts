import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, getIp, handleError, parseBody } from "@/lib/http";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { LOCK_MINUTES, MAX_FAILED, startFullSession } from "@/lib/auth/staff-auth";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await parseBody(req, Body);
    const ip = getIp(req);
    const e = email.toLowerCase();
    if (!(await rateLimit(`login:ip:${ip}`, 20, 900)) || !(await rateLimit(`login:email:${e}`, 10, 900))) {
      throw new ApiError(429, "Too many sign-in attempts. Try again in a few minutes.");
    }
    const [user] = await db.select().from(schema.staff).where(eq(schema.staff.email, e));
    // One message for every failure (unknown email, wrong password, locked, disabled) so the
    // response never reveals which emails exist or which are locked.
    const GENERIC = new ApiError(401, "Incorrect email or password, or the account is temporarily locked");

    const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
    const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash()); // always compare: same timing every path
    if (!user || !ok || !user.active || locked) {
      if (user && !locked) {
        const failed = user.failedLogins + 1;
        await db.update(schema.staff).set({
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        }).where(eq(schema.staff.id, user.id));
      }
      await audit({ type: "system" }, "staff.login_failed", { entity: "staff", entityId: user?.id, meta: { email: e }, ip });
      throw GENERIC;
    }

    await startFullSession(user.id, user.tokenVersion);
    await audit({ type: "staff", id: user.id }, "staff.login", { ip });
    return NextResponse.json({ ok: true });
  } catch (err) { return handleError(err); }
}
