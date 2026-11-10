import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, notFound } from "@/lib/http";
import { totalPaid } from "@/lib/payments";
import { outstanding } from "@/lib/transactions";

export const GET = adminRoute("payments.read", async ({ params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const [r] = await db.select({ p: schema.payments, receipt: schema.receipts, t: schema.transactions, c: schema.customers, prop: schema.properties })
    .from(schema.payments).innerJoin(schema.receipts, eq(schema.receipts.paymentId, schema.payments.id))
    .innerJoin(schema.transactions, eq(schema.payments.transactionId, schema.transactions.id))
    .innerJoin(schema.customers, eq(schema.payments.customerId, schema.customers.id))
    .innerJoin(schema.properties, eq(schema.transactions.propertyId, schema.properties.id)).where(eq(schema.payments.id, params.id));
  if (!r || r.p.status !== "success") throw notFound("No receipt for this payment");
  const paid = await totalPaid(r.t.id);
  return {
    receiptNumber: r.receipt.number, issuedAt: r.receipt.issuedAt, paymentReference: r.p.reference, paidAt: r.p.paidAt,
    method: r.p.method, kind: r.p.kind, amountKobo: r.p.amountKobo,
    transactionReference: r.t.reference, priceKobo: r.t.priceKobo, totalPaidKobo: paid, balanceKobo: outstanding(r.t.priceKobo, paid),
    customer: { fullName: r.c.fullName, email: r.c.email, phone: r.c.phone },
    property: { name: r.prop.name, city: r.prop.city, area: r.prop.area },
  };
});
