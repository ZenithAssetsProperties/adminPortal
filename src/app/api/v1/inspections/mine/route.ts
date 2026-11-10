import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";

// My inspection history. (POST /inspections, the booking form, is public and lives one level up.)
export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const rows = await db.select({ i: schema.inspections, name: schema.properties.name, slug: schema.properties.slug })
    .from(schema.inspections).innerJoin(schema.properties, eq(schema.properties.id, schema.inspections.propertyId))
    .where(eq(schema.inspections.customerId, customer.id)).orderBy(desc(schema.inspections.createdAt));
  return { items: rows.map(({ i, name, slug }) => ({ id: i.id, kind: i.kind, status: i.status, preferredDate: i.preferredDate, preferredTime: i.preferredTime, visitors: i.visitors, createdAt: i.createdAt, property: { name, slug } })) };
}, { name: "my-inspections" });
