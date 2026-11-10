import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, notFound, preflight } from "@/lib/http";
import { buildTimeline, outstandingFor, uuidOr404 } from "@/lib/public-dto";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer, params }) => {
  const id = uuidOr404(params.id);
  // another customer's id looks exactly like a missing one
  const [t] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.id, id), eq(schema.transactions.customerId, customer.id)));
  if (!t) throw notFound("Transaction not found");
  const [events, pays, [p]] = await Promise.all([
    db.select().from(schema.transactionEvents).where(eq(schema.transactionEvents.transactionId, t.id)).orderBy(schema.transactionEvents.createdAt),
    db.select({ p: schema.payments, r: schema.receipts.number }).from(schema.payments).leftJoin(schema.receipts, eq(schema.receipts.paymentId, schema.payments.id))
      .where(eq(schema.payments.transactionId, t.id)).orderBy(desc(schema.payments.createdAt)),
    db.select({ slug: schema.properties.slug, name: schema.properties.name, city: schema.properties.city, area: schema.properties.area }).from(schema.properties).where(eq(schema.properties.id, t.propertyId)),
  ]);
  return {
    id: t.id, reference: t.reference, stage: t.stage, priceKobo: t.priceKobo, ...(await outstandingFor(t)), property: p ?? null,
    timeline: buildTimeline(t.stage, events),
    payments: pays.map(({ p: x, r }) => ({ reference: x.reference, kind: x.kind, amountKobo: x.amountKobo, status: x.status, paidAt: x.paidAt, receiptNumber: r })),
  };
}, { name: "transaction" });
