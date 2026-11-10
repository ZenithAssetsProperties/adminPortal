import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, notFound, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import { requireUuid } from "../../_id";

const Body = z.object({
  propertyIds: z.array(z.string().uuid()).max(200).default([]),
  leadIds: z.array(z.string().uuid()).max(200).default([]),
});

/** Bulk-assign properties and/or leads to a sales agent. */
export const POST = adminRoute("agents.write", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const body = await parseBody(req, Body);
  if (!body.propertyIds.length && !body.leadIds.length) throw badRequest("Pick at least one property or lead");
  const [agent] = await db.select({ id: schema.staff.id, active: schema.staff.active }).from(schema.staff).where(and(eq(schema.staff.id, id), eq(schema.staff.role, "sales_agent")));
  if (!agent) throw notFound();
  if (!agent.active) throw badRequest("This agent is deactivated");
  const props = body.propertyIds.length
    ? await db.update(schema.properties).set({ agentId: id, updatedAt: new Date() }).where(and(inArray(schema.properties.id, body.propertyIds), isNull(schema.properties.deletedAt))).returning({ id: schema.properties.id })
    : [];
  const leads = body.leadIds.length
    ? await db.update(schema.leads).set({ agentId: id, updatedAt: new Date() }).where(inArray(schema.leads.id, body.leadIds)).returning({ id: schema.leads.id })
    : [];
  await audit({ type: "staff", id: staff.id }, "agent.assign", { entity: "staff", entityId: id, meta: { properties: props.length, leads: leads.length }, ip: getIp(req) });
  if (props.length || leads.length) await notifyStaff(id, { type: "assignment", title: "New assignments", body: `${props.length} propert${props.length === 1 ? "y" : "ies"} and ${leads.length} lead${leads.length === 1 ? "" : "s"} assigned to you.` });
  return { propertiesAssigned: props.length, leadsAssigned: leads.length };
});
