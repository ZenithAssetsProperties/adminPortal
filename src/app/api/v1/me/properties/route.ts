import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";
import { cardDto, originOf } from "@/lib/public-dto";

const LABEL: Record<string, string> = {
  property_selected: "Property selected", inspection_completed: "Inspection completed", reservation_confirmed: "Reserved",
  payment_received: "Payment received", documentation_processing: "Documentation processing", ownership_completed: "Purchase completed", cancelled: "Cancelled",
};

// "My Properties" (PRD 15). Lives at /me/properties because GET /properties is the public listing.
export const OPTIONS = preflight;
export const GET = customerRoute(async ({ req, customer }) => {
  const origin = originOf(req);
  const txs = await db.select().from(schema.transactions).where(eq(schema.transactions.customerId, customer.id)).orderBy(desc(schema.transactions.createdAt));
  if (!txs.length) return { items: [] };
  const props = await db.select().from(schema.properties).where(inArray(schema.properties.id, txs.map((t) => t.propertyId)));
  const paid = await db.select({ id: schema.payments.transactionId, t: sql<number>`sum(${schema.payments.amountKobo})::bigint` }).from(schema.payments)
    .where(and(inArray(schema.payments.transactionId, txs.map((t) => t.id)), eq(schema.payments.status, "success"))).groupBy(schema.payments.transactionId);
  const docs = await db.select({ id: schema.documents.transactionId, n: sql<number>`count(*)::int` }).from(schema.documents)
    .where(and(eq(schema.documents.customerId, customer.id), eq(schema.documents.status, "approved"))).groupBy(schema.documents.transactionId);
  const items = await Promise.all(txs.map(async (t) => {
    const p = props.find((x) => x.id === t.propertyId)!;
    const paidKobo = Number(paid.find((x) => x.id === t.id)?.t ?? 0);
    const nDocs = docs.find((d) => d.id === t.id)?.n ?? 0;
    return {
      transactionId: t.id, reference: t.reference, status: LABEL[t.stage] ?? t.stage, stage: t.stage,
      property: await cardDto(p, origin), priceKobo: t.priceKobo, paidKobo, outstandingKobo: Math.max(0, t.priceKobo - paidKobo),
      documentation: nDocs > 0 ? "available" : "pending", documentCount: nDocs,
    };
  }));
  return { items };
}, { name: "my-properties" });
