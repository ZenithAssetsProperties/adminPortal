import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, customerRoute, parseBody, preflight } from "@/lib/http";
import { checkPhoneOtp } from "@/lib/customer-auth";
import { rateLimit } from "@/lib/ratelimit";

export const OPTIONS = preflight;
export const POST = customerRoute(async ({ req, customer }) => {
  const { token, code } = await parseBody(req, z.object({ token: z.string().max(2000), code: z.string().length(6) }));
  if (!(await rateLimit(`cvpv:${customer.id}`, 6, 600))) throw new ApiError(429, "Too many attempts, request a new code later");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
  if (!c.phone || !(await checkPhoneOtp(c.id, c.phone, token, code))) throw new ApiError(400, "That code is not correct or has expired");
  await db.update(schema.customers).set({ phoneVerified: true }).where(eq(schema.customers.id, c.id));
  return { ok: true };
}, { name: "verify-phone" });
