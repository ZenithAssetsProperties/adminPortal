import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, getIp, parseBody, preflight, publicRoute } from "@/lib/http";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { frontendUrl, signEmailToken } from "@/lib/customer-auth";
import { sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const Body = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(30),
  password: z.string().max(128),
  country: z.string().trim().max(80).optional(),
  isDiaspora: z.boolean().optional(),
});

// Same answer whether or not the email is already registered, so the form cannot be used to find out who has an account.
const GENERIC = { ok: true, message: "If this email can be registered, your account is ready. Please sign in." };

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const b = await parseBody(req, Body);
  const problem = passwordProblem(b.password);
  if (problem) throw new ApiError(400, problem);
  const email = b.email.toLowerCase();
  if (!(await rateLimit(`creg:ip:${getIp(req) ?? "?"}`, 30, 3600)) || !(await rateLimit(`creg:email:${email}`, 5, 3600))) {
    throw new ApiError(429, "Too many attempts, please try again later");
  }
  const [existing] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.email, email));
  if (existing) {
    await sendEmail(email, "Zenith Asset Group account", "Someone tried to create an account with this email, but you already have one. If it was you, sign in or use 'Forgot password'.");
    return Response.json(GENERIC, { status: 201 });
  }
  const [c] = await db.insert(schema.customers).values({
    fullName: b.fullName, email, phone: b.phone, passwordHash: await hashPassword(b.password),
    country: b.country, isDiaspora: b.isDiaspora ?? false, source: "website",
  }).onConflictDoNothing().returning();
  if (c) {
    const token = await signEmailToken(c);
    await sendEmail(email, "Verify your email", `Welcome to Zenith Asset Group. Verify your email: ${frontendUrl()}/verify-email?token=${token}`);
    await audit({ type: "customer", id: c.id }, "customer.register", { entity: "customer", entityId: c.id, ip: getIp(req) });
  }
  return Response.json(GENERIC, { status: 201 });
}, { name: "register" });
