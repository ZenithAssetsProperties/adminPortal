import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, notFound, preflight } from "@/lib/http";
import { publicVisible, uuidOr404 } from "@/lib/public-dto";

export const OPTIONS = preflight;
export const PUT = customerRoute(async ({ customer, params }) => {
  const id = uuidOr404(params.propertyId);
  const [p] = await db.select({ id: schema.properties.id }).from(schema.properties).where(and(eq(schema.properties.id, id), publicVisible));
  if (!p) throw notFound("Property not found");
  await db.insert(schema.favorites).values({ customerId: customer.id, propertyId: id }).onConflictDoNothing();
  return { ok: true, saved: true };
}, { name: "fav-put" });

export const DELETE = customerRoute(async ({ customer, params }) => {
  const id = uuidOr404(params.propertyId);
  await db.delete(schema.favorites).where(and(eq(schema.favorites.customerId, customer.id), eq(schema.favorites.propertyId, id)));
  return { ok: true, saved: false };
}, { name: "fav-del" });
