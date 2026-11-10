import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, customerRoute, getIp, parseBody, preflight } from "@/lib/http";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { signCustomer } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const OPTIONS = preflight;
export const POST = customerRoute(async ({ req, customer }) => {
  const { current, next } = await parseBody(req, z.object({ current: z.string().max(200), next: z.string().max(200) }));
  if (!(await rateLimit(`cpw:${customer.id}`, 5, 900))) throw new ApiError(429, "Too many attempts");
  const problem = passwordProblem(next);
  if (problem) throw new ApiError(400, problem);
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
  if (!c.passwordHash || !(await verifyPassword(current, c.passwordHash))) throw new ApiError(401, "Current password is incorrect");
  const tv = c.tokenVersion + 1; // signs out every other device
  await db.update(schema.customers).set({ passwordHash: await hashPassword(next), tokenVersion: tv }).where(eq(schema.customers.id, c.id));
  await audit({ type: "customer", id: c.id }, "customer.password_changed", { ip: getIp(req) });
  return { ok: true, token: await signCustomer(c.id, tv) };
}, { name: "cpw" });
