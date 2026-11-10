import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { makeReference } from "@/lib/money";
import { notifyCustomer, notifyStaff } from "@/lib/notify";
import { formatNaira } from "@/lib/money";
import { ApiError } from "@/lib/http";

/** Total successfully paid against a transaction. */
export async function totalPaid(transactionId: string): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.payments.amountKobo}), 0)::bigint` })
    .from(schema.payments)
    .where(and(eq(schema.payments.transactionId, transactionId), eq(schema.payments.status, "success")));
  return Number(r.total);
}

/**
 * Marks a payment successful. Safe to call many times (the webhook and the
 * return-page check can both fire): only the first call has an effect.
 * `paidKobo` is what the gateway says was actually charged; it must match.
 */
export async function settlePayment(reference: string, paidKobo: number, opts: { method?: string; staffId?: string } = {}) {
  const outcome = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.reference, reference)).for("update");
    if (!p) throw new ApiError(404, "Payment not found");
    if (p.status === "success") return { already: true as const, payment: p };
    if (paidKobo !== p.amountKobo) {
      await tx.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.id, p.id));
      throw new ApiError(409, "Amount paid does not match the amount due");
    }
    const [paid] = await tx.update(schema.payments)
      .set({ status: "success", paidAt: new Date(), method: opts.method ?? p.method })
      .where(eq(schema.payments.id, p.id)).returning();
    await tx.insert(schema.receipts).values({ number: makeReference("RCP"), paymentId: p.id }).onConflictDoNothing();

    const [t] = await tx.select().from(schema.transactions).where(eq(schema.transactions.id, p.transactionId)).for("update");
    const [sum] = await tx.select({ total: sql<number>`coalesce(sum(${schema.payments.amountKobo}), 0)::bigint` })
      .from(schema.payments).where(and(eq(schema.payments.transactionId, t.id), eq(schema.payments.status, "success")));
    const paidTotal = Number(sum.total);
    const fullyPaid = paidTotal >= t.priceKobo;

    let stage = t.stage;
    if (p.kind === "reservation" && ["property_selected", "inspection_completed"].includes(t.stage)) stage = "reservation_confirmed";
    if (p.kind !== "reservation" && ["property_selected", "inspection_completed", "reservation_confirmed"].includes(t.stage)) stage = "payment_received";
    if (fullyPaid && ["payment_received", "reservation_confirmed"].includes(stage)) stage = "documentation_processing";
    if (stage !== t.stage) {
      await tx.update(schema.transactions).set({ stage, updatedAt: new Date() }).where(eq(schema.transactions.id, t.id));
      await tx.insert(schema.transactionEvents).values({ transactionId: t.id, stage, note: `Payment ${reference} received`, staffId: opts.staffId });
    }

    if (p.kind === "reservation") {
      await tx.update(schema.reservations).set({ status: "active" })
        .where(and(eq(schema.reservations.propertyId, t.propertyId), eq(schema.reservations.customerId, t.customerId), eq(schema.reservations.status, "pending")));
      await tx.update(schema.properties).set({ status: "reserved", updatedAt: new Date() })
        .where(and(eq(schema.properties.id, t.propertyId), eq(schema.properties.status, "available")));
    }
    if (fullyPaid) {
      await tx.update(schema.properties).set({ status: "sold", updatedAt: new Date() }).where(eq(schema.properties.id, t.propertyId));
      await tx.update(schema.reservations).set({ status: "converted" })
        .where(and(eq(schema.reservations.propertyId, t.propertyId), eq(schema.reservations.customerId, t.customerId), eq(schema.reservations.status, "active")));
    }
    return { already: false as const, payment: paid, transaction: t, paidTotal };
  });

  if (!outcome.already) {
    const t = outcome.transaction;
    await notifyCustomer(t.customerId, {
      type: "payment_confirmed", title: "Payment confirmed", sms: true,
      body: `We received ${formatNaira(outcome.payment.amountKobo)} (ref ${reference}). Outstanding balance: ${formatNaira(Math.max(0, t.priceKobo - outcome.paidTotal))}.`,
    });
    await notifyStaff(t.agentId, { type: "payment_received", title: "Payment received", body: `${formatNaira(outcome.payment.amountKobo)} paid on transaction ${t.reference}.` });
  }
  return outcome;
}
