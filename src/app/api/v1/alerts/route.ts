import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { badRequest, customerRoute, parseBody, preflight } from "@/lib/http";

const Criteria = z.object({
  city: z.string().trim().max(80).optional(), state: z.string().trim().max(80).optional(),
  type: z.enum(["land", "house", "apartment", "commercial"]).optional(),
  minBedrooms: z.number().int().min(0).max(100).optional(), maxPriceKobo: z.number().int().positive().optional(),
}).strict().refine((c) => Object.keys(c).length > 0, "Add at least one condition");

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const items = await db.select().from(schema.alerts).where(eq(schema.alerts.customerId, customer.id)).orderBy(desc(schema.alerts.createdAt));
  return { items };
}, { name: "alerts" });

export const POST = customerRoute(async ({ req, customer }) => {
  const { criteria } = await parseBody(req, z.object({ criteria: Criteria }));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.alerts).where(eq(schema.alerts.customerId, customer.id));
  if (n >= 20) throw badRequest("You can keep up to 20 alerts. Remove one first.");
  const [row] = await db.insert(schema.alerts).values({ customerId: customer.id, criteria }).returning();
  return Response.json(row, { status: 201 });
}, { name: "alerts-post" });
