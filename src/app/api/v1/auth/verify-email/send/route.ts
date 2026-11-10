import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, customerRoute, preflight } from "@/lib/http";
import { frontendUrl, signEmailToken } from "@/lib/customer-auth";
import { sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";

export const OPTIONS = preflight;
export const POST = customerRoute(async ({ customer }) => {
  if (!(await rateLimit(`cve:${customer.id}`, 5, 3600))) throw new ApiError(429, "Too many requests");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
  if (c.emailVerified) return { ok: true, alreadyVerified: true };
  await sendEmail(c.email, "Verify your email", `Verify your email: ${frontendUrl()}/verify-email?token=${await signEmailToken(c)}`);
  return { ok: true };
}, { name: "verify-email-send" });
