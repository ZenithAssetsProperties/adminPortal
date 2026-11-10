import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { conflict } from "@/lib/http";

/**
 * Re-opening a reserved or sold property while a buyer holds it (or has paid) would let it be sold twice.
 * To put it back on the market, cancel the reservation or transaction first.
 */
export async function assertCanReopen(propertyId: string, nextStatus: string) {
  if (nextStatus !== "available" && nextStatus !== "draft") return;
  const [hold] = await db.select({ id: schema.reservations.id }).from(schema.reservations)
    .where(and(eq(schema.reservations.propertyId, propertyId), eq(schema.reservations.status, "active"))).limit(1);
  const [paid] = await db.select({ id: schema.payments.id }).from(schema.payments)
    .innerJoin(schema.transactions, eq(schema.payments.transactionId, schema.transactions.id))
    .where(and(eq(schema.transactions.propertyId, propertyId), eq(schema.payments.status, "success"), sql`${schema.transactions.stage} <> 'cancelled'`)).limit(1);
  if (hold || paid) throw conflict("A buyer holds or has paid for this property. Cancel the reservation or transaction first.");
}
