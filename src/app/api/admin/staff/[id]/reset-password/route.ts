import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, adminRoute, getIp, notFound, parseBody } from "@/lib/http";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { requireUuid } from "../../../agents/_id";

export const POST = adminRoute("staff.manage", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const { password } = await parseBody(req, z.object({ password: z.string().max(128) }));
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(400, problem);
  const [t] = await db.select({ tv: schema.staff.tokenVersion }).from(schema.staff).where(eq(schema.staff.id, id));
  if (!t) throw notFound();
  // new token version = every existing session for this person stops working
  await db.update(schema.staff).set({ passwordHash: await hashPassword(password), tokenVersion: t.tv + 1, failedLogins: 0, lockedUntil: null }).where(eq(schema.staff.id, id));
  await audit({ type: "staff", id: staff.id }, "staff.password_reset", { entity: "staff", entityId: id, ip: getIp(req) });
  return { ok: true };
});
