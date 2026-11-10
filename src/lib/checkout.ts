import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, badRequest, conflict, notFound } from "@/lib/http";
import { makeReference } from "@/lib/money";
import { initializePayment, verifyPayment } from "@/lib/paystack";
import { settlePayment } from "@/lib/payments";
import { notifyStaff } from "@/lib/notify";
import { frontendUrl } from "@/lib/customer-auth";

type Cust = { id: string; email: string; fullName: string };
const MAX_HELD_RESERVATIONS = 3;
const PENDING_HOLD_MINUTES = 30; // a pending reservation holds the property while the buyer pays

const callbackUrl = () => process.env.PAYMENT_CALLBACK_URL || (frontendUrl() ? `${frontendUrl()}/payment/callback` : undefined);

/**
 * Reserve a property. The amount always comes from the property record, never from the client.
 * Fee 0  -> reservation is active immediately and the property is marked reserved.
 * Fee >0 -> a pending reservation + payment is created and a Paystack checkout link is returned.
 */
export async function createReservation(customer: Cust, slug: string, acceptTerms: boolean) {
  if (acceptTerms !== true) throw badRequest("You must accept the transaction terms to continue");

  const made = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.properties)
      .where(and(eq(schema.properties.slug, slug), isNull(schema.properties.deletedAt))).for("update");
    if (!p || p.status === "draft") throw notFound("Property not found");
    if (p.status !== "available") throw conflict("This property is no longer available");

    // someone else may be mid-payment on this property
    const [other] = await tx.select({ id: schema.reservations.id }).from(schema.reservations).where(and(
      eq(schema.reservations.propertyId, p.id), eq(schema.reservations.status, "pending"),
      gt(schema.reservations.expiresAt, new Date()), sql`${schema.reservations.customerId} <> ${customer.id}`));
    if (other) throw conflict("Another buyer is completing a reservation on this property. Please try again shortly.");

    // The buyer's own unfinished attempt still holds the property: do not hand out a fresh 30 minutes each
    // time (that would let one unpaid account block a listing forever). Stale ones are closed quietly.
    await tx.update(schema.reservations).set({ status: "expired" })
      .where(and(eq(schema.reservations.customerId, customer.id), eq(schema.reservations.status, "pending"), sql`${schema.reservations.expiresAt} <= now()`));
    const [mineOpen] = await tx.select({ id: schema.reservations.id }).from(schema.reservations)
      .where(and(eq(schema.reservations.propertyId, p.id), eq(schema.reservations.customerId, customer.id), eq(schema.reservations.status, "pending"))).limit(1);
    if (mineOpen) throw conflict("You already have a reservation in progress for this property. Finish paying, or try again in a few minutes.");
    // cap how many properties one account can hold at once
    const [{ held }] = await tx.select({ held: sql<number>`count(*)::int` }).from(schema.reservations)
      .where(and(eq(schema.reservations.customerId, customer.id), sql`${schema.reservations.status} IN ('active','pending')`));
    if (held >= MAX_HELD_RESERVATIONS) throw conflict(`You can hold up to ${MAX_HELD_RESERVATIONS} reservations at a time`);
    // A free reservation holds a property for days at no cost, so it needs a verified email.
    if (p.reservationFeeKobo === 0) {
      const [c] = await tx.select({ ok: schema.customers.emailVerified }).from(schema.customers).where(eq(schema.customers.id, customer.id));
      if (!c?.ok) throw new ApiError(403, "Please verify your email address before reserving a property");
    }

    const free = p.reservationFeeKobo === 0;
    const now = new Date();
    const [reservation] = await tx.insert(schema.reservations).values({
      propertyId: p.id, customerId: customer.id, amountKobo: p.reservationFeeKobo, termsAcceptedAt: now,
      status: free ? "active" : "pending",
      expiresAt: free ? new Date(now.getTime() + p.reservationDays * 86_400_000) : new Date(now.getTime() + PENDING_HOLD_MINUTES * 60_000),
    }).returning();
    const [transaction] = await tx.insert(schema.transactions).values({
      reference: makeReference("TXN"), customerId: customer.id, propertyId: p.id, priceKobo: p.priceKobo,
      agentId: p.agentId, stage: free ? "reservation_confirmed" : "property_selected",
    }).returning();
    await tx.insert(schema.transactionEvents).values({ transactionId: transaction.id, stage: "property_selected", note: "Customer selected the property" });
    if (free) {
      await tx.insert(schema.transactionEvents).values({ transactionId: transaction.id, stage: "reservation_confirmed", note: "Reservation confirmed (no fee)" });
      await tx.update(schema.properties).set({ status: "reserved", updatedAt: now }).where(eq(schema.properties.id, p.id));
      return { p, reservation, transaction, payment: null };
    }
    const [payment] = await tx.insert(schema.payments).values({
      reference: makeReference("PAY"), transactionId: transaction.id, customerId: customer.id, kind: "reservation", amountKobo: p.reservationFeeKobo,
    }).returning();
    return { p, reservation, transaction, payment };
  });

  await notifyStaff(made.p.agentId, { type: "reservation", title: "New reservation", body: `${customer.fullName} reserved ${made.p.name}.` });
  if (!made.payment) return { reservation: made.reservation, transaction: made.transaction, payment: null, authorizationUrl: null };

  try {
    const init = await initializePayment({
      email: customer.email, amountKobo: made.payment.amountKobo, reference: made.payment.reference, callbackUrl: callbackUrl(),
      metadata: { transactionId: made.transaction.id, kind: "reservation", customerId: customer.id },
    });
    return { reservation: made.reservation, transaction: made.transaction, payment: made.payment, authorizationUrl: init.authorizationUrl };
  } catch (e) {
    // could not reach the gateway: free the property again so it is not stuck
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.id, made.payment.id));
    await db.update(schema.reservations).set({ status: "cancelled" }).where(eq(schema.reservations.id, made.reservation.id));
    throw e;
  }
}

export type PayKind = "deposit" | "installment" | "balance" | "full";

/** Rules for how much may be paid right now. Returns an error message or null. Exported so it can be unit-tested. */
export function paymentRuleProblem(a: {
  kind: PayKind; amountKobo: number; priceKobo: number; paidKobo: number;
  planAvailable: boolean; minDepositPercent: number; maxPlanMonths: number;
}): string | null {
  const outstanding = a.priceKobo - a.paidKobo;
  if (!Number.isInteger(a.amountKobo) || a.amountKobo <= 0) return "Amount must be greater than zero";
  if (outstanding <= 0) return "This transaction is already fully paid";
  if (a.amountKobo > outstanding) return "Amount is more than the outstanding balance";
  if (a.kind === "full" || a.kind === "balance") return a.amountKobo === outstanding ? null : "A full or balance payment must equal the outstanding balance";
  if (!a.planAvailable) return "This property has no payment plan. Pay the full outstanding balance.";
  const minDeposit = Math.round((a.priceKobo * a.minDepositPercent) / 100);
  if (a.kind === "deposit") {
    if (a.paidKobo >= minDeposit) return "The deposit has already been paid. Make an installment payment.";
    return a.paidKobo + a.amountKobo >= minDeposit ? null : `The deposit must reach at least ${a.minDepositPercent}% of the price`;
  }
  // installment
  if (a.paidKobo < minDeposit) return "Pay the required deposit before installments";
  const smallest = Math.min(outstanding, Math.ceil((a.priceKobo - minDeposit) / a.maxPlanMonths));
  return a.amountKobo >= smallest ? null : "Installment is below the minimum allowed for this plan";
}

export async function startPayment(customer: Cust, input: { transactionId: string; kind: PayKind; amountKobo: number; acceptTerms: boolean }) {
  if (input.acceptTerms !== true) throw badRequest("You must confirm you have reviewed the property information and transaction terms");
  // Everything that decides "may this payment start?" runs under row locks so two simultaneous
  // checkouts cannot both pass the balance check.
  const { t, payment } = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(schema.transactions)
      .where(and(eq(schema.transactions.id, input.transactionId), eq(schema.transactions.customerId, customer.id))).for("update");
    if (!t) throw notFound("Transaction not found");
    if (t.stage === "cancelled") throw conflict("This transaction was cancelled");
    const [p] = await tx.select().from(schema.properties).where(eq(schema.properties.id, t.propertyId)).for("update");

    // The buyer must still hold the property. A late payment after the hold lapsed must not win it back.
    const [mine] = await tx.select({ id: schema.reservations.id }).from(schema.reservations).where(and(
      eq(schema.reservations.propertyId, p.id), eq(schema.reservations.customerId, customer.id),
      sql`(${schema.reservations.status} = 'active' OR (${schema.reservations.status} = 'pending' AND ${schema.reservations.expiresAt} > now()))`)).limit(1);
    const [rival] = await tx.select({ id: schema.reservations.id }).from(schema.reservations).where(and(
      eq(schema.reservations.propertyId, p.id), sql`${schema.reservations.customerId} <> ${customer.id}`,
      sql`(${schema.reservations.status} IN ('active','converted') OR (${schema.reservations.status} = 'pending' AND ${schema.reservations.expiresAt} > now()))`)).limit(1);
    const [paidRival] = await tx.select({ id: schema.payments.id }).from(schema.payments)
      .innerJoin(schema.transactions, eq(schema.payments.transactionId, schema.transactions.id))
      .where(and(eq(schema.transactions.propertyId, p.id), sql`${schema.transactions.customerId} <> ${customer.id}`,
        eq(schema.payments.status, "success"), sql`${schema.transactions.stage} <> 'cancelled'`)).limit(1);
    if (p.deletedAt || p.status === "draft") throw conflict("This property is no longer available");
    if (rival || paidRival) throw conflict("This property is now held by another buyer");
    if (p.status === "sold" && !mine) throw conflict("This property has been sold");
    if (p.status === "reserved" && !mine) throw conflict("Your reservation has expired. Please reserve the property again.");

    // one online payment at a time per transaction (an abandoned one frees up after 30 minutes)
    const [inFlight] = await tx.select({ id: schema.payments.id }).from(schema.payments).where(and(
      eq(schema.payments.transactionId, t.id), eq(schema.payments.status, "pending"),
      sql`${schema.payments.createdAt} > now() - interval '30 minutes'`)).limit(1);
    if (inFlight) throw conflict("You already have a payment in progress for this transaction. Finish it or wait a few minutes.");

    const [sum] = await tx.select({ total: sql<number>`coalesce(sum(${schema.payments.amountKobo}), 0)::bigint` }).from(schema.payments)
      .where(and(eq(schema.payments.transactionId, t.id), eq(schema.payments.status, "success")));
    const problem = paymentRuleProblem({
      kind: input.kind, amountKobo: input.amountKobo, priceKobo: t.priceKobo, paidKobo: Number(sum.total),
      planAvailable: p.paymentPlanAvailable, minDepositPercent: p.minDepositPercent, maxPlanMonths: p.maxPlanMonths,
    });
    if (problem) throw badRequest(problem);

    const [payment] = await tx.insert(schema.payments).values({
      reference: makeReference("PAY"), transactionId: t.id, customerId: customer.id, kind: input.kind, amountKobo: input.amountKobo,
    }).returning();
    return { t, payment };
  });
  await db.insert(schema.analyticsEvents).values({ type: "payment_started", propertyId: t.propertyId, customerId: customer.id, meta: { reference: payment.reference } }).catch(() => {});
  try {
    const init = await initializePayment({
      email: customer.email, amountKobo: payment.amountKobo, reference: payment.reference, callbackUrl: callbackUrl(),
      metadata: { transactionId: t.id, kind: input.kind, customerId: customer.id },
    });
    return { reference: payment.reference, amountKobo: payment.amountKobo, authorizationUrl: init.authorizationUrl };
  } catch (e) {
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.id, payment.id));
    throw e;
  }
}

/** Return-page check: asks Paystack what happened and settles (idempotently) when it succeeded. */
export async function verifyReference(customerId: string, reference: string) {
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.reference, reference), eq(schema.payments.customerId, customerId)));
  if (!p) throw notFound("Payment not found");
  if (p.status === "success") return { status: "success" as const, reference };
  const r = await verifyPayment(reference);
  if (!r.success) return { status: p.status, reference };
  await settlePayment(reference, r.amountKobo, { method: r.channel });
  return { status: "success" as const, reference };
}
