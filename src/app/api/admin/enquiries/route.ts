import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, parseBody, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { isScopedToOwn } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { convertToLead } from "./_convert";

const Q = PageQuery.extend({
  kind: z.enum(["enquiry", "callback", "consultation", "property_request", "whatsapp"]).optional(),
  handled: z.enum(["1", "0"]).optional(),
});

export const GET = adminRoute("enquiries.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const conds: (SQL | undefined)[] = [];
  if (q.kind) conds.push(eq(schema.enquiries.kind, q.kind));
  if (q.handled) conds.push(eq(schema.enquiries.handled, q.handled === "1"));
  if (q.q) {
    const l = likeEscape(q.q);
    conds.push(or(ilike(schema.enquiries.name, l), ilike(schema.enquiries.email, l), ilike(schema.enquiries.phone, l), ilike(schema.enquiries.message, l)));
  }
  // sales agents only see enquiries tied to leads assigned to them
  if (isScopedToOwn(staff.role)) {
    conds.push(inArray(schema.enquiries.leadId, db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.agentId, staff.id))));
  }
  const where = conds.length ? and(...conds) : undefined;
  const [items, [{ n }]] = await Promise.all([
    db.select({
      id: schema.enquiries.id, kind: schema.enquiries.kind, name: schema.enquiries.name, email: schema.enquiries.email, phone: schema.enquiries.phone,
      message: schema.enquiries.message, handled: schema.enquiries.handled, leadId: schema.enquiries.leadId, source: schema.enquiries.source,
      createdAt: schema.enquiries.createdAt, propertyId: schema.enquiries.propertyId, propertyName: schema.properties.name,
    }).from(schema.enquiries).leftJoin(schema.properties, eq(schema.enquiries.propertyId, schema.properties.id))
      .where(where).orderBy(desc(schema.enquiries.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.enquiries).where(where),
  ]);
  return paged(items, n, q);
});

const Create = z.object({
  kind: z.enum(["enquiry", "callback", "consultation", "property_request", "whatsapp"]).default("enquiry"),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).nullish(),
  phone: z.string().trim().min(5).max(30).nullish(),
  message: z.string().trim().max(4000).nullish(),
  propertyId: z.string().uuid().nullish(),
  source: z.string().trim().max(60).nullish(),
}).refine((v) => v.email || v.phone, { message: "Give an email or a phone number", path: ["email"] });

// Manual capture (e.g. a phone call). Like website enquiries, it becomes a lead straight away.
export const POST = adminRoute("enquiries.write", async ({ req, staff }) => {
  const body = await parseBody(req, Create);
  const [enq] = await db.insert(schema.enquiries).values({ ...body, source: body.source || "manual" }).returning();
  const lead = await convertToLead(enq, isScopedToOwn(staff.role) ? staff.id : null);
  await audit({ type: "staff", id: staff.id }, "enquiry.create", { entity: "enquiry", entityId: enq.id, meta: { leadId: lead.id }, ip: getIp(req) });
  return Response.json({ ...enq, leadId: lead.id }, { status: 201 });
});
