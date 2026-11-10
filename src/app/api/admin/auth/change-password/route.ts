import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, adminRoute, getIp, parseBody } from "@/lib/http";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { STAFF_COOKIE } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export const POST = adminRoute(null, async ({ req, staff }) => {
  const { current, next } = await parseBody(req, z.object({ current: z.string().max(200), next: z.string().max(200) }));
  if (!(await rateLimit(`pwchange:${staff.id}`, 5, 900))) throw new ApiError(429, "Too many attempts");
  const problem = passwordProblem(next);
  if (problem) throw new ApiError(400, problem);
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, staff.id));
  if (!(await verifyPassword(current, row.passwordHash))) throw new ApiError(401, "Current password is incorrect");
  // bumping tokenVersion signs out every other device
  await db.update(schema.staff).set({ passwordHash: await hashPassword(next), tokenVersion: row.tokenVersion + 1 }).where(eq(schema.staff.id, staff.id));
  (await cookies()).delete(STAFF_COOKIE);
  await audit({ type: "staff", id: staff.id }, "staff.password_changed", { ip: getIp(req) });
  return { ok: true, signedOut: true };
});
