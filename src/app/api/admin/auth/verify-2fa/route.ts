import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, getIp, handleError, parseBody } from "@/lib/http";
import { startFullSession, staffFromPendingOrSession } from "@/lib/auth/staff-auth";
import { verifyTotp } from "@/lib/auth/totp";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const { code } = await parseBody(req, z.object({ code: z.string().length(6) }));
    const { row, pending } = await staffFromPendingOrSession();
    if (!pending) return NextResponse.json({ ok: true });
    if (!(await rateLimit(`totp:${row.id}`, 8, 300))) throw new ApiError(429, "Too many attempts. Wait a few minutes.");
    if (!row.totpEnabled || !row.totpSecret || !verifyTotp(row.totpSecret, code)) {
      await audit({ type: "staff", id: row.id }, "staff.2fa_failed", { ip: getIp(req) });
      throw new ApiError(401, "That code is not correct");
    }
    await startFullSession(row.id, row.tokenVersion);
    await audit({ type: "staff", id: row.id }, "staff.login", { ip: getIp(req) });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
