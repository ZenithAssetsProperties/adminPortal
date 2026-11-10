import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, customerRoute, preflight } from "@/lib/http";
import { newPhoneOtp } from "@/lib/customer-auth";
import { sendSms } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";

export const OPTIONS = preflight;
// Returns an opaque `token` the browser sends back with the 6-digit code. The code itself is only ever sent by SMS.
export const POST = customerRoute(async ({ customer }) => {
  if (!(await rateLimit(`cvp:${customer.id}`, 5, 3600))) throw new ApiError(429, "Too many requests");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
  if (!c.phone) throw new ApiError(400, "Add a phone number to your profile first");
  const { code, token } = await newPhoneOtp(c, c.phone);
  await sendSms(c.phone, `Your Zenith Asset Group verification code is ${code}. It expires in 10 minutes.`);
  return { ok: true, token };
}, { name: "verify-phone-send" });
