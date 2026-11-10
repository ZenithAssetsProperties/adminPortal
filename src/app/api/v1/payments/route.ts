import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const rows = await db.select({ p: schema.payments, rc: schema.receipts, prop: schema.properties.name, txRef: schema.transactions.reference })
    .from(schema.payments)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.payments.transactionId))
    .innerJoin(schema.properties, eq(schema.properties.id, schema.transactions.propertyId))
    .leftJoin(schema.receipts, eq(schema.receipts.paymentId, schema.payments.id))
    .where(eq(schema.payments.customerId, customer.id)).orderBy(desc(schema.payments.createdAt)).limit(200);
  return {
    items: rows.map(({ p, rc, prop, txRef }) => ({
      id: p.id, reference: p.reference, transactionReference: txRef, property: prop, kind: p.kind, amountKobo: p.amountKobo,
      status: p.status, method: p.method, paidAt: p.paidAt, createdAt: p.createdAt,
      receipt: rc ? { number: rc.number, issuedAt: rc.issuedAt, customerName: customer.fullName } : null,
    })),
  };
}, { name: "payments" });
