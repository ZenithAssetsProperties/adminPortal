import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";
import { cardDto, originOf } from "@/lib/public-dto";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ req, customer }) => {
  const rows = await db.select({ p: schema.properties }).from(schema.favorites)
    .innerJoin(schema.properties, eq(schema.properties.id, schema.favorites.propertyId))
    .where(eq(schema.favorites.customerId, customer.id)).orderBy(desc(schema.favorites.createdAt));
  const origin = originOf(req);
  return { items: await Promise.all(rows.filter(({ p }) => !p.deletedAt && p.status !== "draft").map(({ p }) => cardDto(p, origin))) };
}, { name: "favorites" });
