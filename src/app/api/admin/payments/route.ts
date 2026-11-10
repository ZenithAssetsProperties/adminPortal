import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody, parseQuery } from "@/lib/http";
import { offset, paged } from "@/lib/query";
import { PaymentQuery, paymentFilters, paymentSelect } from "@/lib/payments-query";
import { makeReference } from "@/lib/money";
import { settlePayment, totalPaid } from "@/lib/payments";
import { outstanding } from "@/lib/transactions";
import { audit } from "@/lib/audit";

const p = schema.payments;

export const GET = adminRoute("payments.read", async ({ req }) => {
  const q = parseQuery(req, PaymentQuery);
  const where = paymentFilters(q);
  const [rows, [{ n, total }]] = await Promise.all([
    paymentSelect().where(where).orderBy(desc(p.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${p.amountKobo}) filter (where ${p.status} = 'success'), 0)::bigint`.mapWith(Number) })
      .from(p).innerJoin(schema.transactions, eq(p.transactionId, schema.transactions.id)).innerJoin(schema.customers, eq(p.customerId, schema.customers.id)).where(where),
  ]);
  return { ...paged(rows.map((r) => ({ ...r.p, customerName: r.customerName, propertyName: r.propertyName, transactionRef: r.transactionRef })), n, q), successTotalKobo: total };
});

const Offline = z.object({
  transactionId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  method: z.enum(["bank_transfer", "cash", "pos", "other"]),
  kind: z.enum(["reservation", "deposit", "installment", "balance", "full"]).optional(),
});

/** Record money received outside the website (bank transfer, cash, POS). It is settled straight away. */
export const POST = adminRoute("payments.write", async ({ req, staff }) => {
  const b = await parseBody(req, Offline);
  const created = await db.transaction(async (tx) => {
    // lock the deal so two staff cannot both squeeze in an over-payment
    const [t] = await tx.select().from(schema.transactions).where(eq(schema.transactions.id, b.transactionId)).for("update");
    if (!t) throw notFound("Transaction not found");
    if (t.stage === "cancelled") throw conflict("This transaction is cancelled");
    const paid = await totalPaid(t.id);
    const [{ pending }] = await tx.select({ pending: sql<number>`coalesce(sum(${p.amountKobo}), 0)::bigint`.mapWith(Number) })
      .from(p).where(and(eq(p.transactionId, t.id), eq(p.status, "pending"), sql`${p.recordedBy} is not null`));
    const owed = outstanding(t.priceKobo, paid + pending);
    if (b.amountKobo > owed) throw conflict(`Amount is more than the outstanding balance`);
    const kind = b.kind ?? (paid === 0 ? (b.amountKobo >= t.priceKobo ? "full" : "deposit") : b.amountKobo === owed ? "balance" : "installment");
    const [row] = await tx.insert(p).values({
      reference: makeReference("OFF"), transactionId: t.id, customerId: t.customerId, kind, amountKobo: b.amountKobo,
      method: b.method, status: "pending", recordedBy: staff.id,
    }).returning();
    return row;
  });
  try {
    await settlePayment(created.reference, created.amountKobo, { method: b.method, staffId: staff.id });
  } catch (e) {
    // do not leave an unsettled row behind if settling failed
    await db.update(p).set({ status: "failed" }).where(and(eq(p.id, created.id), inArray(p.status, ["pending"])));
    throw e;
  }
  await audit({ type: "staff", id: staff.id }, "payment.record_offline", { entity: "payment", entityId: created.id, meta: { amountKobo: b.amountKobo, method: b.method }, ip: getIp(req) });
  const [done] = await db.select().from(p).where(eq(p.id, created.id));
  return Response.json(done, { status: 201 });
});
