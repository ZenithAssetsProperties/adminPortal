import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, notFound, parseBody } from "@/lib/http";
import { isScopedToOwn } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireUuid } from "../../../agents/_id";

export const POST = adminRoute("leads.write", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const { body } = await parseBody(req, z.object({ body: z.string().trim().min(1).max(4000) }));
  const conds = [eq(schema.leads.id, id)];
  if (isScopedToOwn(staff.role)) conds.push(eq(schema.leads.agentId, staff.id));
  const [lead] = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(...conds));
  if (!lead) throw notFound();
  const [note] = await db.insert(schema.leadNotes).values({ leadId: id, staffId: staff.id, body }).returning();
  await db.update(schema.leads).set({ updatedAt: new Date() }).where(eq(schema.leads.id, id));
  await audit({ type: "staff", id: staff.id }, "lead.note", { entity: "lead", entityId: id, ip: getIp(req) });
  return Response.json({ ...note, staffName: staff.name }, { status: 201 });
});
