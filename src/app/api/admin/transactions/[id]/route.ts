import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, conflict, forbidden, getIp, notFound, parseBody } from "@/lib/http";
import { isScopedToOwn } from "@/lib/rbac";
import { totalPaid } from "@/lib/payments";
import { notifyCustomer } from "@/lib/notify";
import { ALL_STAGES, STAGE_LABELS, outstanding, progress, stageChangeProblem, type Stage } from "@/lib/transactions";
import { audit } from "@/lib/audit";

const Id = z.string().uuid();

async function detail(id: string) {
  const [r] = await db.select({ t: schema.transactions, customer: schema.customers, property: schema.properties })
    .from(schema.transactions).innerJoin(schema.customers, eq(schema.transactions.customerId, schema.customers.id))
    .innerJoin(schema.properties, eq(schema.transactions.propertyId, schema.properties.id)).where(eq(schema.transactions.id, id));
  if (!r) throw notFound();
  const [payments, events, paid] = await Promise.all([
    db.select().from(schema.payments).where(eq(schema.payments.transactionId, id)).orderBy(desc(schema.payments.createdAt)),
    db.select().from(schema.transactionEvents).where(eq(schema.transactionEvents.transactionId, id)).orderBy(desc(schema.transactionEvents.createdAt)),
    totalPaid(id),
  ]);
  return {
    ...r.t, paidKobo: paid, outstandingKobo: outstanding(r.t.priceKobo, paid),
    customer: { id: r.customer.id, fullName: r.customer.fullName, email: r.customer.email, phone: r.customer.phone },
    property: { id: r.property.id, name: r.property.name, city: r.property.city, area: r.property.area },
    payments, events, progress: progress(r.t.stage as Stage),
  };
}

export const GET = adminRoute("transactions.read", async ({ staff, params }) => {
  if (!Id.safeParse(params.id).success) throw notFound();
  const d = await detail(params.id);
  if (isScopedToOwn(staff.role) && d.agentId !== staff.id) throw forbidden();
  return d;
});

const Patch = z.object({
  stage: z.enum(ALL_STAGES as [string, ...string[]]).optional(),
  note: z.string().trim().max(1000).optional(),
  agentId: z.string().uuid().nullable().optional(),
});

export const PATCH = adminRoute("transactions.write", async ({ req, staff, params }) => {
  if (!Id.safeParse(params.id).success) throw notFound();
  const b = await parseBody(req, Patch);
  if (b.stage === undefined && b.agentId === undefined) throw badRequest("Nothing to update");
  const result = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(schema.transactions).where(eq(schema.transactions.id, params.id)).for("update");
    if (!cur) throw notFound();
    // defence in depth: scoped roles may only touch their own deals, and never reassign them
    if (isScopedToOwn(staff.role) && cur.agentId !== staff.id) throw notFound();
    if (isScopedToOwn(staff.role) && b.agentId !== undefined) throw forbidden("Only managers can reassign transactions");
    const set: Partial<typeof schema.transactions.$inferInsert> = { updatedAt: new Date() };
    if (b.agentId !== undefined) {
      if (b.agentId) {
        const [a] = await tx.select({ id: schema.staff.id, active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.id, b.agentId));
        if (!a || !a.active) throw badRequest("That agent does not exist or is inactive");
      }
      set.agentId = b.agentId;
    }
    let changedTo: Stage | null = null;
    if (b.stage !== undefined) {
      if (b.stage === cur.stage) throw badRequest("The transaction is already at that stage");
      const problem = stageChangeProblem(b.stage as Stage, { priceKobo: cur.priceKobo, paidKobo: await totalPaid(cur.id) });
      if (problem) throw conflict(problem);
      set.stage = b.stage as typeof cur.stage; changedTo = b.stage as Stage;
    }
    const [u] = await tx.update(schema.transactions).set(set).where(eq(schema.transactions.id, cur.id)).returning();
    if (changedTo) await tx.insert(schema.transactionEvents).values({ transactionId: cur.id, stage: u.stage, note: b.note ?? null, staffId: staff.id });
    return { u, changedTo };
  });
  if (result.changedTo) {
    await notifyCustomer(result.u.customerId, {
      type: "transaction_stage", title: "Your purchase has moved on",
      body: `Transaction ${result.u.reference} is now: ${STAGE_LABELS[result.changedTo]}.${b.note ? ` ${b.note}` : ""}`,
    });
  }
  await audit({ type: "staff", id: staff.id }, result.changedTo ? "transaction.stage" : "transaction.update", { entity: "transaction", entityId: result.u.id, meta: { stage: result.changedTo, agentId: b.agentId }, ip: getIp(req) });
  return detail(result.u.id);
});
