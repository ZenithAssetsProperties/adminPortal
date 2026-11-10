import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, getIp, parseBody, preflight, publicRoute } from "@/lib/http";
import { dummyHash, verifyPassword } from "@/lib/auth/password";
import { signCustomer } from "@/lib/auth/session";
import { customerDto } from "@/lib/customer-auth";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const Body = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const { email, password } = await parseBody(req, Body);
  const e = email.toLowerCase();
  const ip = getIp(req) ?? "?";
  // lockout-style limiting: too many tries for one email, or from one address, are refused
  if (!(await rateLimit(`clogin:email:${e}`, 10, 900)) || !(await rateLimit(`clogin:ip:${ip}`, 100, 900))) {
    throw new ApiError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, e));
  const ok = await verifyPassword(password, c?.passwordHash ?? dummyHash()); // same work whether or not the email exists
  if (!c || !c.passwordHash || !ok || c.blocked) {
    await audit({ type: "system" }, "customer.login_failed", { entity: "customer", entityId: c?.id, ip });
    throw new ApiError(401, "Incorrect email or password");
  }
  await db.update(schema.customers).set({ lastActiveAt: new Date() }).where(eq(schema.customers.id, c.id));
  return { token: await signCustomer(c.id, c.tokenVersion), customer: customerDto(c) };
}, { name: "login" });
