import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getIp, parseBody, preflight, publicRoute } from "@/lib/http";
import { frontendUrl, signResetToken } from "@/lib/customer-auth";
import { sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const { email } = await parseBody(req, z.object({ email: z.string().trim().email().max(200) }));
  const e = email.toLowerCase();
  // always the same answer: never reveal whether the email has an account
  const reply = { ok: true, message: "If that email has an account, a reset link is on its way." };
  if (!(await rateLimit(`cfp:email:${e}`, 3, 3600)) || !(await rateLimit(`cfp:ip:${getIp(req) ?? "?"}`, 20, 3600))) return reply;
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, e));
  if (c && !c.blocked) {
    await sendEmail(e, "Reset your password", `Use this link within 1 hour: ${frontendUrl()}/reset-password?token=${await signResetToken(c)}`);
  }
  return reply;
}, { name: "forgot" });
