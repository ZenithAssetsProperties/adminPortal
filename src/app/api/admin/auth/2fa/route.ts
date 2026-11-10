import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, getIp, handleError, parseBody } from "@/lib/http";
import { startFullSession, staffFromPendingOrSession } from "@/lib/auth/staff-auth";
import { newTotpSecret, totpSetup, verifyTotp } from "@/lib/auth/totp";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

/** Start enrolment: returns a QR code for an authenticator app. */
export async function GET() {
  try {
    const { row } = await staffFromPendingOrSession();
    if (row.totpEnabled) throw new ApiError(409, "Two-step login is already on");
    const secret = row.totpSecret ?? newTotpSecret();
    if (!row.totpSecret) await db.update(schema.staff).set({ totpSecret: secret }).where(eq(schema.staff.id, row.id));
    const { qrDataUrl } = await totpSetup(row.email, secret);
    return NextResponse.json({ qrDataUrl, secret });
  } catch (e) { return handleError(e); }
}

/** Confirm enrolment with the first code. */
export async function POST(req: NextRequest) {
  try {
    const { code } = await parseBody(req, z.object({ code: z.string().length(6) }));
    const { row, pending } = await staffFromPendingOrSession();
    if (!(await rateLimit(`totp:${row.id}`, 8, 300))) throw new ApiError(429, "Too many attempts. Wait a few minutes.");
    if (row.totpEnabled || !row.totpSecret) throw new ApiError(409, "Start setup first");
    if (!verifyTotp(row.totpSecret, code)) throw new ApiError(401, "That code is not correct");
    await db.update(schema.staff).set({ totpEnabled: true }).where(eq(schema.staff.id, row.id));
    if (pending) await startFullSession(row.id, row.tokenVersion);
    await audit({ type: "staff", id: row.id }, "staff.2fa_enabled", { ip: getIp(req) });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
