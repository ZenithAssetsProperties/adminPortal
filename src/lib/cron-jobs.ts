import { and, eq, gt, isNotNull, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notifyCustomer } from "@/lib/notify";
import { releasePropertyIfFree } from "@/lib/reservations";
import { totalPaid } from "@/lib/payments";
import { formatNaira } from "@/lib/money";
import { monthKey, monthlyDue, outstanding } from "@/lib/transactions";

async function alreadySent(customerId: string, type: string) {
  const [r] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.customerId, customerId), eq(schema.notifications.type, type))).limit(1);
  return Boolean(r);
}

/** Expire overdue holds and send one "expires tomorrow" reminder per reservation. */
export async function expireReservations(now = new Date()) {
  const r = schema.reservations;
  // Checkout started but never paid: these never held the property, so just close them quietly.
  await db.update(r).set({ status: "expired" }).where(and(eq(r.status, "pending"), isNotNull(r.expiresAt), lt(r.expiresAt, now)));
  const overdue = await db.select().from(r).where(and(eq(r.status, "active"), isNotNull(r.expiresAt), lt(r.expiresAt, now)));
  let expired = 0;
  for (const res of overdue) {
    const changed = await db.transaction(async (tx) => {
      const done = await tx.update(r).set({ status: "expired" }).where(and(eq(r.id, res.id), eq(r.status, "active"))).returning({ id: r.id });
      if (!done.length) return false; // someone else already handled it
      await releasePropertyIfFree(tx, res.propertyId, res.id);
      return true;
    });
    if (!changed) continue;
    expired++;
    await notifyCustomer(res.customerId, { type: "reservation_expired", title: "Reservation expired", sms: true, body: "Your property reservation has expired and the property is open to other buyers again. Contact us if you still want it." });
  }
  const soon = await db.select().from(r).where(and(eq(r.status, "active"), isNotNull(r.expiresAt), gt(r.expiresAt, now), lte(r.expiresAt, new Date(now.getTime() + 86_400_000))));
  let reminded = 0;
  for (const res of soon) {
    const type = `reservation_expiring:${res.id}`;
    if (await alreadySent(res.customerId, type)) continue;
    await notifyCustomer(res.customerId, { type, title: "Reservation expires soon", sms: true, body: `Your reservation runs out on ${res.expiresAt!.toDateString()}. Complete your payment or ask us to extend it.` });
    reminded++;
  }
  return { expired, reminded };
}

/** One reminder per plan transaction per calendar month. */
export async function sendPaymentReminders(now = new Date()) {
  const t = schema.transactions;
  const plans = await db.select().from(t).where(and(isNotNull(t.planMonths), sql`${t.stage} <> 'cancelled'`));
  const key = monthKey(now);
  let sent = 0;
  for (const tx of plans) {
    const owed = outstanding(tx.priceKobo, await totalPaid(tx.id));
    if (owed <= 0) continue;
    const due = monthlyDue({ priceKobo: tx.priceKobo, depositPercent: tx.depositPercent, planMonths: tx.planMonths!, outstandingKobo: owed });
    if (due <= 0) continue;
    const type = `payment_due:${tx.id}:${key}`;
    if (await alreadySent(tx.customerId, type)) continue;
    await notifyCustomer(tx.customerId, { type, title: "Payment due this month", sms: true, body: `Your instalment of ${formatNaira(due)} is due this month on transaction ${tx.reference}. Outstanding balance: ${formatNaira(owed)}.` });
    sent++;
  }
  return { sent };
}
