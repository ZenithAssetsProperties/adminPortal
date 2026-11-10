import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, conflict, getIp, notFound, parseBody } from "@/lib/http";
import { isScopedToOwn } from "@/lib/rbac";
import { notifyCustomer, sendEmail, sendSms } from "@/lib/notify";
import { audit } from "@/lib/audit";

const Id = z.string().uuid();
const Patch = z.object({
  action: z.enum(["confirm", "reschedule", "complete", "cancel"]).optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredTime: z.string().trim().min(1).max(30).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  staffNote: z.string().trim().max(2000).nullable().optional(),
});

async function load(id: string, staff: { id: string; role: Parameters<typeof isScopedToOwn>[0] }) {
  if (!Id.safeParse(id).success) throw notFound();
  const conds = [eq(schema.inspections.id, id)];
  if (isScopedToOwn(staff.role)) conds.push(or(eq(schema.properties.agentId, staff.id), eq(schema.inspections.assignedTo, staff.id))!);
  const [r] = await db.select({ i: schema.inspections, propertyName: schema.properties.name })
    .from(schema.inspections).innerJoin(schema.properties, eq(schema.inspections.propertyId, schema.properties.id)).where(and(...conds));
  if (!r) throw notFound();
  return r;
}

export const GET = adminRoute("inspections.read", async ({ staff, params }) => {
  const r = await load(params.id, staff);
  return { ...r.i, propertyName: r.propertyName };
});

/** Tells the customer by in-platform notice + email + SMS (or straight to the booking contact when there is no account). */
async function tell(i: typeof schema.inspections.$inferSelect, title: string, body: string, type: string) {
  if (i.customerId) return notifyCustomer(i.customerId, { type, title, body, email: true, sms: true });
  if (i.email) await sendEmail(i.email, title, body);
  if (i.phone) await sendSms(i.phone, `${title}: ${body}`);
}

export const PATCH = adminRoute("inspections.write", async ({ req, staff, params }) => {
  const body = await parseBody(req, Patch);
  if (!Object.keys(body).length) throw badRequest("Nothing to update");
  const { i, propertyName } = await load(params.id, staff);
  const set: Partial<typeof schema.inspections.$inferInsert> = { updatedAt: new Date() };

  if (body.assignedTo !== undefined) {
    if (body.assignedTo) {
      const [s] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.id, body.assignedTo), eq(schema.staff.active, true)));
      if (!s) throw badRequest("That staff member does not exist or is inactive");
    }
    set.assignedTo = body.assignedTo;
  }
  if (body.staffNote !== undefined) set.staffNote = body.staffNote;

  let message: { title: string; text: string; type: string } | null = null;
  const when = (d: string, t: string) => `${d} at ${t}`;
  if (body.action) {
    if (i.status === "completed" || i.status === "cancelled") throw conflict(`This inspection is already ${i.status}`);
    switch (body.action) {
      case "confirm":
        if (i.status !== "requested") throw conflict("Only a requested inspection can be confirmed");
        set.status = "confirmed";
        message = { type: "inspection_confirmed", title: "Inspection confirmed", text: `Your inspection of ${propertyName} is confirmed for ${when(i.preferredDate, i.preferredTime)}.` };
        break;
      case "reschedule":
        if (!body.preferredDate || !body.preferredTime) throw badRequest("Give the new date and time");
        set.preferredDate = body.preferredDate; set.preferredTime = body.preferredTime; set.status = "confirmed";
        message = { type: "inspection_rescheduled", title: "Inspection rescheduled", text: `Your inspection of ${propertyName} has been moved to ${when(body.preferredDate, body.preferredTime)}.` };
        break;
      case "complete":
        if (i.status !== "confirmed") throw conflict("Confirm the inspection before marking it completed");
        set.status = "completed";
        break;
      case "cancel":
        set.status = "cancelled";
        message = { type: "inspection_cancelled", title: "Inspection cancelled", text: `Your inspection of ${propertyName} on ${when(i.preferredDate, i.preferredTime)} has been cancelled. Contact us to book another time.` };
        break;
    }
  } else if (body.preferredDate || body.preferredTime) {
    throw badRequest("Use the reschedule action to change the date or time");
  }

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(schema.inspections).set(set).where(eq(schema.inspections.id, i.id)).returning();
    if (body.action === "complete" && i.customerId) {
      // the buyer has now seen the property: move their deal on from "property selected"
      const moved = await tx.update(schema.transactions).set({ stage: "inspection_completed", updatedAt: new Date() })
        .where(and(eq(schema.transactions.customerId, i.customerId), eq(schema.transactions.propertyId, i.propertyId), eq(schema.transactions.stage, "property_selected"))).returning();
      for (const t of moved) await tx.insert(schema.transactionEvents).values({ transactionId: t.id, stage: "inspection_completed", note: "Inspection completed", staffId: staff.id });
    }
    return updated;
  });
  if (message) await tell(row, message.title, message.text, message.type);
  await audit({ type: "staff", id: staff.id }, `inspection.${body.action ?? "update"}`, { entity: "inspection", entityId: row.id, ip: getIp(req) });
  return { ...row, propertyName };
});
