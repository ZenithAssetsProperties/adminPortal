import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, notFound, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireUuid } from "../_id";

async function loadAgent(id: string) {
  const [a] = await db.select({
    id: schema.staff.id, name: schema.staff.name, email: schema.staff.email, phone: schema.staff.phone, active: schema.staff.active, tokenVersion: schema.staff.tokenVersion,
  }).from(schema.staff).where(and(eq(schema.staff.id, id), eq(schema.staff.role, "sales_agent")));
  if (!a) throw notFound();
  return a;
}

export const GET = adminRoute("agents.read", async ({ params }) => {
  const a = await loadAgent(requireUuid(params.id));
  const agent = { id: a.id, name: a.name, email: a.email, phone: a.phone, active: a.active };
  const [properties, leads] = await Promise.all([
    db.select({ id: schema.properties.id, name: schema.properties.name, status: schema.properties.status, city: schema.properties.city })
      .from(schema.properties).where(and(eq(schema.properties.agentId, agent.id), isNull(schema.properties.deletedAt))).orderBy(desc(schema.properties.createdAt)),
    db.select({ id: schema.leads.id, name: schema.leads.name, status: schema.leads.status })
      .from(schema.leads).where(and(eq(schema.leads.agentId, agent.id), notInArray(schema.leads.status, ["purchased", "lost"]))).orderBy(desc(schema.leads.updatedAt)),
  ]);
  return { agent, properties, leads };
});

export const PATCH = adminRoute("agents.write", async ({ req, staff, params }) => {
  const agent = await loadAgent(requireUuid(params.id));
  const body = await parseBody(req, z.object({
    active: z.boolean().optional(), name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().min(5).max(30).nullish(),
  }));
  if (!Object.keys(body).length) throw badRequest("Nothing to update");
  const set: Partial<typeof schema.staff.$inferInsert> = {};
  if (body.name) set.name = body.name;
  if (body.phone !== undefined) set.phone = body.phone;
  if (body.active !== undefined) {
    set.active = body.active;
    if (!body.active) set.tokenVersion = agent.tokenVersion + 1; // sign the agent out immediately
  }
  const [row] = await db.update(schema.staff).set(set).where(eq(schema.staff.id, agent.id))
    .returning({ id: schema.staff.id, name: schema.staff.name, email: schema.staff.email, phone: schema.staff.phone, active: schema.staff.active });
  await audit({ type: "staff", id: staff.id }, body.active === undefined ? "agent.update" : body.active ? "agent.activate" : "agent.deactivate", { entity: "staff", entityId: agent.id, ip: getIp(req) });
  return row;
});
