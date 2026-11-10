import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, forbidden, getIp, notFound, parseBody } from "@/lib/http";
import { isScopedToOwn } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import { requireUuid } from "../../agents/_id";
import { assertAssignableAgent } from "../_agent";

const STATUSES = ["new", "contacted", "inspection_scheduled", "negotiation", "purchased", "lost"] as const;

async function loadLead(id: string, staff: { id: string; role: Parameters<typeof isScopedToOwn>[0] }) {
  const conds = [eq(schema.leads.id, id)];
  if (isScopedToOwn(staff.role)) conds.push(eq(schema.leads.agentId, staff.id));
  const [lead] = await db.select().from(schema.leads).where(and(...conds));
  if (!lead) throw notFound();
  return lead;
}

export const GET = adminRoute("leads.read", async ({ staff, params }) => {
  const lead = await loadLead(requireUuid(params.id), staff);
  const [notes, enquiries, property, agent] = await Promise.all([
    db.select({ id: schema.leadNotes.id, body: schema.leadNotes.body, createdAt: schema.leadNotes.createdAt, staffName: schema.staff.name })
      .from(schema.leadNotes).leftJoin(schema.staff, eq(schema.leadNotes.staffId, schema.staff.id)).where(eq(schema.leadNotes.leadId, lead.id)).orderBy(asc(schema.leadNotes.createdAt)),
    db.select({ id: schema.enquiries.id, kind: schema.enquiries.kind, message: schema.enquiries.message, createdAt: schema.enquiries.createdAt }).from(schema.enquiries).where(eq(schema.enquiries.leadId, lead.id)),
    lead.propertyId ? db.select({ id: schema.properties.id, name: schema.properties.name }).from(schema.properties).where(eq(schema.properties.id, lead.propertyId)) : Promise.resolve([]),
    lead.agentId ? db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, lead.agentId)) : Promise.resolve([]),
  ]);
  return { lead, notes, enquiries, property: property[0] ?? null, agent: agent[0] ?? null };
});

export const PATCH = adminRoute("leads.write", async ({ req, staff, params }) => {
  const lead = await loadLead(requireUuid(params.id), staff);
  const body = await parseBody(req, z.object({ status: z.enum(STATUSES).optional(), agentId: z.string().uuid().nullable().optional() }));
  if (body.status === undefined && body.agentId === undefined) throw badRequest("Nothing to update");
  const set: Partial<typeof schema.leads.$inferInsert> = { updatedAt: new Date() };
  if (body.status) set.status = body.status;
  if (body.agentId !== undefined) {
    if (isScopedToOwn(staff.role)) throw forbidden("Only managers can reassign leads");
    if (body.agentId) await assertAssignableAgent(body.agentId);
    set.agentId = body.agentId;
  }
  const [row] = await db.update(schema.leads).set(set).where(eq(schema.leads.id, lead.id)).returning();
  if (body.status && body.status !== lead.status) {
    await audit({ type: "staff", id: staff.id }, "lead.status", { entity: "lead", entityId: lead.id, meta: { from: lead.status, to: body.status }, ip: getIp(req) });
  }
  if (body.agentId !== undefined && body.agentId !== lead.agentId) {
    await audit({ type: "staff", id: staff.id }, "lead.assign", { entity: "lead", entityId: lead.id, meta: { agentId: body.agentId }, ip: getIp(req) });
    if (body.agentId) await notifyStaff(body.agentId, { type: "lead_assigned", title: "New lead assigned", body: `${lead.name} has been assigned to you.` });
  }
  return row;
});
