import { desc, eq, inArray, and, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const txs = await db.select().from(schema.transactions).where(eq(schema.transactions.customerId, customer.id)).orderBy(desc(schema.transactions.createdAt));
  if (!txs.length) return { items: [] };
  const props = await db.select({ id: schema.properties.id, slug: schema.properties.slug, name: schema.properties.name, city: schema.properties.city, area: schema.properties.area })
    .from(schema.properties).where(inArray(schema.properties.id, txs.map((t) => t.propertyId)));
  const paid = await db.select({ id: schema.payments.transactionId, t: sql<number>`sum(${schema.payments.amountKobo})::bigint` }).from(schema.payments)
    .where(and(inArray(schema.payments.transactionId, txs.map((t) => t.id)), eq(schema.payments.status, "success"))).groupBy(schema.payments.transactionId);
  return {
    items: txs.map((t) => {
      const paidKobo = Number(paid.find((x) => x.id === t.id)?.t ?? 0);
      return { id: t.id, reference: t.reference, stage: t.stage, priceKobo: t.priceKobo, paidKobo, outstandingKobo: Math.max(0, t.priceKobo - paidKobo), createdAt: t.createdAt, property: props.find((p) => p.id === t.propertyId) ?? null };
    }),
  };
}, { name: "transactions" });
