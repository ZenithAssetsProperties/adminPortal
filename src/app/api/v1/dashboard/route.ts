import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const me = customer.id;
  const n = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const [transactions, reservations, favorites, unread, docs, upcoming, paid, price] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions).where(and(eq(schema.transactions.customerId, me), sql`${schema.transactions.stage} <> 'cancelled'`))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(schema.reservations).where(and(eq(schema.reservations.customerId, me), eq(schema.reservations.status, "active")))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(schema.favorites).where(eq(schema.favorites.customerId, me))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.customerId, me), isNull(schema.notifications.readAt)))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(schema.documents).where(and(eq(schema.documents.customerId, me), eq(schema.documents.status, "approved")))),
    n(db.select({ n: sql<number>`count(*)::int` }).from(schema.inspections).where(and(eq(schema.inspections.customerId, me), inArray(schema.inspections.status, ["requested", "confirmed"]), gt(schema.inspections.preferredDate, sql`current_date - 1`)))),
    db.select({ t: sql<number>`coalesce(sum(${schema.payments.amountKobo}),0)::bigint` }).from(schema.payments).where(and(eq(schema.payments.customerId, me), eq(schema.payments.status, "success"))),
    db.select({ t: sql<number>`coalesce(sum(${schema.transactions.priceKobo}),0)::bigint` }).from(schema.transactions).where(and(eq(schema.transactions.customerId, me), sql`${schema.transactions.stage} <> 'cancelled'`)),
  ]);
  const totalPaid = Number(paid[0].t), totalPrice = Number(price[0].t);
  return {
    transactions, activeReservations: reservations, savedProperties: favorites, unreadNotifications: unread,
    documentsAvailable: docs, upcomingInspections: upcoming,
    totalPaidKobo: totalPaid, totalOutstandingKobo: Math.max(0, totalPrice - totalPaid),
  };
}, { name: "dashboard" });
