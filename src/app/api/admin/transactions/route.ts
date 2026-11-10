import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { isScopedToOwn } from "@/lib/rbac";
import { makeReference } from "@/lib/money";
import { ALL_STAGES } from "@/lib/transactions";
import { audit } from "@/lib/audit";

const Q = PageQuery.extend({
  stage: z.enum(ALL_STAGES as [string, ...string[]]).optional(),
  outstanding: z.enum(["1"]).optional(),
  agentId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});

const t = schema.transactions;
const paidSql = sql<number>`coalesce((select sum(${schema.payments.amountKobo}) from ${schema.payments} where ${schema.payments.transactionId} = ${t.id} and ${schema.payments.status} = 'success'), 0)::bigint`.mapWith(Number);

export const GET = adminRoute("transactions.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const c = schema.customers, p = schema.properties;
  const conds: (SQL | undefined)[] = [];
  if (q.stage) conds.push(eq(t.stage, q.stage as typeof t.$inferSelect.stage));
  if (q.agentId) conds.push(eq(t.agentId, q.agentId));
  if (q.customerId) conds.push(eq(t.customerId, q.customerId));
  if (q.outstanding) conds.push(sql`${t.priceKobo} > ${paidSql}`);
  if (q.q) { const l = likeEscape(q.q); conds.push(or(ilike(t.reference, l), ilike(c.fullName, l), ilike(p.name, l))); }
  if (isScopedToOwn(staff.role)) conds.push(eq(t.agentId, staff.id));
  const where = and(...conds);
  const [rows, [{ n }]] = await Promise.all([
    db.select({ t, paid: paidSql, customerName: c.fullName, propertyName: p.name }).from(t)
      .innerJoin(c, eq(t.customerId, c.id)).innerJoin(p, eq(t.propertyId, p.id)).where(where)
      .orderBy(desc(t.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(t).innerJoin(c, eq(t.customerId, c.id)).innerJoin(p, eq(t.propertyId, p.id)).where(where),
  ]);
  return paged(rows.map((r) => ({ ...r.t, paidKobo: r.paid, outstandingKobo: Math.max(0, r.t.priceKobo - r.paid), customerName: r.customerName, propertyName: r.propertyName })), n, q);
});

const Create = z.object({
  customerId: z.string().uuid(), propertyId: z.string().uuid(),
  priceKobo: z.number().int().positive().optional(),
  planMonths: z.number().int().min(1).max(120).nullish(),
  depositPercent: z.number().int().min(0).max(100).nullish(),
  agentId: z.string().uuid().nullish(),
});

export const POST = adminRoute("transactions.write", async ({ req, staff }) => {
  const b = await parseBody(req, Create);
  const row = await db.transaction(async (tx) => {
    const [prop] = await tx.select().from(schema.properties).where(eq(schema.properties.id, b.propertyId));
    if (!prop || prop.deletedAt) throw notFound("Property not found");
    if (prop.status === "sold") throw conflict("This property is already sold");
    const [cust] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, b.customerId));
    if (!cust) throw notFound("Customer not found");
    const [dupe] = await tx.select({ id: t.id }).from(t)
      .where(and(eq(t.customerId, cust.id), eq(t.propertyId, prop.id), sql`${t.stage} <> 'cancelled'`)).limit(1);
    if (dupe) throw conflict("This customer already has an open transaction for this property");
    const [r] = await tx.insert(t).values({
      reference: makeReference("TXN"), customerId: cust.id, propertyId: prop.id, priceKobo: b.priceKobo ?? prop.priceKobo,
      planMonths: b.planMonths ?? null, depositPercent: b.depositPercent ?? null, agentId: b.agentId ?? prop.agentId,
    }).returning();
    await tx.insert(schema.transactionEvents).values({ transactionId: r.id, stage: "property_selected", note: "Transaction created by staff", staffId: staff.id });
    return r;
  });
  await audit({ type: "staff", id: staff.id }, "transaction.create", {
    entity: "transaction", entityId: row.id, ip: getIp(req),
    // staff can override the listed price; keep that visible in the audit trail
    meta: b.priceKobo ? { priceOverrideKobo: b.priceKobo } : undefined,
  });
  return Response.json(row, { status: 201 });
});
