import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, getIp, parseBody, preflight, publicRoute } from "@/lib/http";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { verifyPurposeToken } from "@/lib/customer-auth";
import { audit } from "@/lib/audit";

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const { token, password } = await parseBody(req, z.object({ token: z.string().max(2000), password: z.string().max(128) }));
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(400, problem);
  const claims = await verifyPurposeToken<{ tv: number }>("pwreset", token);
  const bad = new ApiError(400, "This reset link is invalid or has expired");
  if (!claims) throw bad;
  // Single use: the token carries tokenVersion, and the update only matches while it is unchanged.
  const [c] = await db.update(schema.customers)
    .set({ passwordHash: await hashPassword(password), tokenVersion: claims.tv + 1 })
    .where(and(eq(schema.customers.id, claims.sub), sql`${schema.customers.tokenVersion} = ${claims.tv}`, eq(schema.customers.blocked, false))).returning({ id: schema.customers.id });
  if (!c) throw bad;
  await audit({ type: "customer", id: c.id }, "customer.password_reset", { ip: getIp(req) });
  return { ok: true };
}, { name: "reset", limit: 20 });

