import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** After a reservation ends: put the property back on sale if nobody else is holding it. */
export async function releasePropertyIfFree(tx: Tx, propertyId: string, endedReservationId: string) {
  const others = await tx.select({ id: schema.reservations.id }).from(schema.reservations)
    .where(and(eq(schema.reservations.propertyId, propertyId), eq(schema.reservations.status, "active"), ne(schema.reservations.id, endedReservationId)));
  if (others.length) return false;
  const freed = await tx.update(schema.properties).set({ status: "available", updatedAt: new Date() })
    .where(and(eq(schema.properties.id, propertyId), eq(schema.properties.status, "reserved"))).returning({ id: schema.properties.id });
  return freed.length > 0;
}
