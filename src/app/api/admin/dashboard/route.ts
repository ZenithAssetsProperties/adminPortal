import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminRoute } from "@/lib/http";
import { can, isScopedToOwn } from "@/lib/rbac";

const num = (v: unknown) => Number(v ?? 0);

/** KPI cards. Each section is only computed and returned when the signed-in role may read that data. */
export const GET = adminRoute("dashboard.view", async ({ staff }) => {
  const r = staff.role;
  const out: Record<string, unknown> = {};

  if (can(r, "properties.read")) {
    const rows = await db.select({ status: schema.properties.status, n: count() }).from(schema.properties)
      .where(sql`${schema.properties.deletedAt} is null`).groupBy(schema.properties.status);
    out.properties = Object.fromEntries(["draft", "available", "reserved", "sold"].map((s) => [s, num(rows.find((x) => x.status === s)?.n)]));
  }
  const scoped = isScopedToOwn(r); // sales agents only see numbers about their own work
  if (can(r, "enquiries.read")) {
    const own = scoped ? inArray(schema.enquiries.leadId, db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.agentId, staff.id))) : undefined;
    const [x] = await db.select({ n: count() }).from(schema.enquiries).where(and(eq(schema.enquiries.handled, false), own));
    out.newEnquiries = num(x.n);
  }
  if (can(r, "inspections.read")) {
    const own = scoped ? or(eq(schema.properties.agentId, staff.id), eq(schema.inspections.assignedTo, staff.id)) : undefined;
    const [x] = await db.select({ n: count() }).from(schema.inspections).innerJoin(schema.properties, eq(schema.inspections.propertyId, schema.properties.id))
      .where(and(eq(schema.inspections.status, "requested"), own));
    out.pendingInspections = num(x.n);
  }
  if (can(r, "reservations.read")) {
    const [x] = await db.select({ n: count() }).from(schema.reservations).where(eq(schema.reservations.status, "active"));
    out.activeReservations = num(x.n);
  }
  if (can(r, "payments.read")) {
    const res = await db.execute(sql`
      select
        coalesce(sum(amount_kobo) filter (where (paid_at at time zone 'Africa/Lagos') >= date_trunc('month', now() at time zone 'Africa/Lagos')), 0)::bigint as month,
        coalesce(sum(amount_kobo), 0)::bigint as total
      from payments where status = 'success'`);
    out.revenue = { monthKobo: num(res.rows[0].month), totalKobo: num(res.rows[0].total) };
  }
  if (can(r, "transactions.read")) {
    const res = await db.execute(sql`
      select coalesce(sum(greatest(t.price_kobo - coalesce(pp.paid, 0), 0)), 0)::bigint as owed
      from transactions t
      left join (select transaction_id, sum(amount_kobo) as paid from payments where status = 'success' group by transaction_id) pp
        on pp.transaction_id = t.id
      where t.stage <> 'cancelled' ${scoped ? sql`and t.agent_id = ${staff.id}` : sql``}`);
    out.outstandingKobo = num(res.rows[0].owed);
  }
  if (can(r, "leads.read")) {
    const where = isScopedToOwn(r) ? eq(schema.leads.agentId, staff.id) : undefined;
    const rows = await db.select({ status: schema.leads.status, n: count() }).from(schema.leads).where(where).groupBy(schema.leads.status);
    out.leadsByStage = Object.fromEntries(schema.leadStatus.enumValues.map((s) => [s, num(rows.find((x) => x.status === s)?.n)]));
  }

  if (can(r, "audit.read")) {
    const rows = await db.select({
      id: schema.auditLogs.id, action: schema.auditLogs.action, entity: schema.auditLogs.entity, at: schema.auditLogs.createdAt,
      actor: schema.staff.name, actorType: schema.auditLogs.actorType,
    }).from(schema.auditLogs).leftJoin(schema.staff, and(eq(schema.staff.id, schema.auditLogs.actorId), eq(schema.auditLogs.actorType, "staff")))
      .orderBy(desc(schema.auditLogs.createdAt)).limit(15);
    out.activity = { source: "audit", items: rows.map((x) => ({ id: x.id, title: x.action, detail: [x.actor ?? x.actorType, x.entity].filter(Boolean).join(" · "), at: x.at })) };
  } else {
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.staffId, staff.id)).orderBy(desc(schema.notifications.createdAt)).limit(10);
    out.activity = { source: "notifications", items: rows.map((x) => ({ id: x.id, title: x.title, detail: x.body, at: x.createdAt })) };
  }
  return out;
});
