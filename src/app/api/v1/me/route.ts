import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { customerRoute, parseBody, preflight } from "@/lib/http";
import { customerDto } from "@/lib/customer-auth";

const Patch = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  country: z.string().trim().max(80).nullable().optional(),
  isDiaspora: z.boolean().optional(),
});

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
  return customerDto(c);
}, { name: "me" });

export const PATCH = customerRoute(async ({ req, customer }) => {
  const b = await parseBody(req, Patch);
  const [cur] = await db.select().from(schema.customers).where(eq(schema.customers.id, customer.id));
  // a new phone number must be verified again
  const phoneChanged = b.phone !== undefined && b.phone !== cur.phone;
  const [c] = await db.update(schema.customers).set({ ...b, ...(phoneChanged ? { phoneVerified: false } : {}) }).where(eq(schema.customers.id, customer.id)).returning();
  return customerDto(c);
}, { name: "me" });
