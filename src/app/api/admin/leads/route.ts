import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, parseBody, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { isScopedToOwn } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import { assertAssignableAgent } from "./_agent";

const LEAD_STATUSES = ["new", "contacted", "inspection_scheduled", "negotiation", "purchased", "lost"] as const;

const Q = PageQuery.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  agentId: z.string().uuid().optional(),
  unassigned: z.enum(["1"]).optional(),
});

export const GET = adminRoute("leads.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const conds: (SQL | undefined)[] = [];
  if (q.status) conds.push(eq(schema.leads.status, q.status));
  if (isScopedToOwn(staff.role)) conds.push(eq(schema.leads.agentId, staff.id)); // sales agents: own leads only
  else if (q.unassigned) conds.push(isNull(schema.leads.agentId));
  else if (q.agentId) conds.push(eq(schema.leads.agentId, q.agentId));
  if (q.q) {
    const l = likeEscape(q.q);
    conds.push(or(ilike(schema.leads.name, l), ilike(schema.leads.email, l), ilike(schema.leads.phone, l)));
  }
  const where = conds.length ? and(...conds) : undefined;
  const [items, [{ n }]] = await Promise.all([
    db.select({
      id: schema.leads.id, name: schema.leads.name, email: schema.leads.email, phone: schema.leads.phone, status: schema.leads.status,
      source: schema.leads.source, agentId: schema.leads.agentId, agentName: schema.staff.name, propertyId: schema.leads.propertyId,
      propertyName: schema.properties.name, createdAt: schema.leads.createdAt, updatedAt: schema.leads.updatedAt,
    }).from(schema.leads)
      .leftJoin(schema.staff, eq(schema.leads.agentId, schema.staff.id))
      .leftJoin(schema.properties, eq(schema.leads.propertyId, schema.properties.id))
      .where(where).orderBy(desc(schema.leads.updatedAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(where),
  ]);
  return paged(items, n, q);
});

const Create = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).nullish(),
  phone: z.string().trim().min(5).max(30).nullish(),
  propertyId: z.string().uuid().nullish(),
  source: z.string().trim().max(60).default("manual"),
  agentId: z.string().uuid().nullish(),
}).refine((v) => v.email || v.phone, { message: "Give an email or a phone number", path: ["email"] });

export const POST = adminRoute("leads.write", async ({ req, staff }) => {
  const body = await parseBody(req, Create);
  let agentId = body.agentId ?? null;
  if (isScopedToOwn(staff.role)) agentId = staff.id; // agents can only create leads for themselves
  else if (agentId) await assertAssignableAgent(agentId);
  if (body.propertyId) {
    const [p] = await db.select({ id: schema.properties.id }).from(schema.properties).where(and(eq(schema.properties.id, body.propertyId), isNull(schema.properties.deletedAt)));
    if (!p) throw badRequest("That property does not exist");
  }
  const [lead] = await db.insert(schema.leads).values({ ...body, agentId }).returning();
  await audit({ type: "staff", id: staff.id }, "lead.create", { entity: "lead", entityId: lead.id, ip: getIp(req) });
  if (agentId && agentId !== staff.id) await notifyStaff(agentId, { type: "lead_assigned", title: "New lead assigned", body: `${lead.name} has been assigned to you.` });
  return Response.json(lead, { status: 201 });
});
