import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { anon, asStaff, makeCustomer, makeProperty, makeStaff } from "./helpers";

async function makeInspection(over: Partial<typeof schema.inspections.$inferInsert> & { propertyId: string }) {
  const [i] = await db.insert(schema.inspections).values({ name: "Visitor One", phone: "08011111111", preferredDate: "2030-01-15", preferredTime: "10:00", ...over }).returning();
  return i;
}
const patch = (cookie: string, id: string, body: object) => asStaff(cookie, `/api/admin/inspections/${id}`, { method: "PATCH", body });

describe("admin inspections API", () => {
  it("requires a session and the inspections permission", async () => {
    expect((await anon("/api/admin/inspections")).status).toBe(401);
    expect((await asStaff((await makeStaff("finance")).cookie, "/api/admin/inspections")).status).toBe(403);
    expect((await asStaff((await makeStaff("content")).cookie, "/api/admin/inspections")).status).toBe(403);
  });

  it("confirms, notifies the customer, then completes and advances their deal", async () => {
    const admin = await makeStaff("admin"); const customer = await makeCustomer(); const property = await makeProperty();
    const t = (await asStaff(admin.cookie, "/api/admin/transactions", { body: { customerId: customer.id, propertyId: property.id } })).json;
    const i = await makeInspection({ propertyId: property.id, customerId: customer.id, email: customer.email });

    const confirmed = await patch(admin.cookie, i.id, { action: "confirm" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.status).toBe("confirmed");
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, customer.id));
    expect(notes.some((n) => n.type === "inspection_confirmed" && n.body.includes(property.name))).toBe(true);
    const sms = await db.select().from(schema.messageLog).where(eq(schema.messageLog.recipient, customer.phone!));
    expect(sms.some((m) => m.channel === "sms" && m.body.includes("Inspection confirmed"))).toBe(true);

    expect((await patch(admin.cookie, i.id, { action: "confirm" })).status).toBe(409); // already confirmed
    expect((await patch(admin.cookie, i.id, { action: "complete" })).json.status).toBe("completed");
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`)).json.stage).toBe("inspection_completed");
    // finished inspections cannot be changed again
    expect((await patch(admin.cookie, i.id, { action: "cancel" })).status).toBe(409);
  });

  it("reschedules (needs date and time) and cancels, messaging a guest directly", async () => {
    const admin = await makeStaff("admin"); const property = await makeProperty();
    const guestEmail = `guest-${Math.random().toString(36).slice(2)}@example.com`;
    const i = await makeInspection({ propertyId: property.id, email: guestEmail });
    expect((await patch(admin.cookie, i.id, { action: "reschedule" })).status).toBe(400);
    const moved = await patch(admin.cookie, i.id, { action: "reschedule", preferredDate: "2030-02-20", preferredTime: "14:30" });
    expect(moved.json).toMatchObject({ status: "confirmed", preferredDate: "2030-02-20", preferredTime: "14:30" });
    expect((await patch(admin.cookie, i.id, { action: "cancel" })).json.status).toBe("cancelled");
    const mail = await db.select().from(schema.messageLog).where(eq(schema.messageLog.recipient, guestEmail));
    expect(mail.map((m) => m.subject).sort()).toEqual(["Inspection cancelled", "Inspection rescheduled"]);
    expect((await patch(admin.cookie, i.id, { action: "confirm" })).status).toBe(409);
  });

  it("assigns only active staff, saves a note, and validates input", async () => {
    const admin = await makeStaff("admin"); const agent = await makeStaff("sales_agent"); const property = await makeProperty();
    const i = await makeInspection({ propertyId: property.id });
    const ok = await patch(admin.cookie, i.id, { assignedTo: agent.id, staffNote: "Bring keys" });
    expect(ok.json).toMatchObject({ assignedTo: agent.id, staffNote: "Bring keys" });
    expect((await patch(admin.cookie, i.id, { assignedTo: crypto.randomUUID() })).status).toBe(400);
    await db.update(schema.staff).set({ active: false }).where(eq(schema.staff.id, agent.id));
    expect((await patch(admin.cookie, i.id, { assignedTo: agent.id })).status).toBe(400);
    expect((await patch(admin.cookie, i.id, {})).status).toBe(400);
    expect((await patch(admin.cookie, i.id, { action: "explode" })).status).toBe(400);
    expect((await patch(admin.cookie, "bad-id", { action: "confirm" })).status).toBe(404);
  });

  it("limits sales agents to their own properties or assignments", async () => {
    const admin = await makeStaff("admin"); const mine = await makeStaff("sales_agent"); const other = await makeStaff("sales_agent");
    const myProp = await makeProperty({ agentId: mine.id }); const otherProp = await makeProperty({ agentId: other.id });
    const a = await makeInspection({ propertyId: myProp.id });
    const b = await makeInspection({ propertyId: otherProp.id });
    const c = await makeInspection({ propertyId: otherProp.id, assignedTo: mine.id });
    const ids = (await asStaff(mine.cookie, "/api/admin/inspections?pageSize=100")).json.items.map((x: { id: string }) => x.id);
    expect(ids).toContain(a.id); expect(ids).toContain(c.id); expect(ids).not.toContain(b.id);
    expect((await asStaff(mine.cookie, `/api/admin/inspections/${b.id}`)).status).toBe(404);
    expect((await patch(mine.cookie, b.id, { action: "confirm" })).status).toBe(404);
    expect((await patch(mine.cookie, a.id, { action: "confirm" })).status).toBe(200);
    expect((await asStaff(admin.cookie, `/api/admin/inspections/${b.id}`)).status).toBe(200);
  });

  it("filters by status, kind, property and date range", async () => {
    const admin = await makeStaff("admin"); const property = await makeProperty();
    await makeInspection({ propertyId: property.id, preferredDate: "2031-03-01", kind: "virtual" });
    await makeInspection({ propertyId: property.id, preferredDate: "2031-04-01", status: "confirmed" });
    const get = (qs: string) => asStaff(admin.cookie, `/api/admin/inspections?propertyId=${property.id}&${qs}`);
    expect((await get("")).json.total).toBe(2);
    expect((await get("kind=virtual")).json.total).toBe(1);
    expect((await get("status=confirmed")).json.total).toBe(1);
    expect((await get("from=2031-03-15")).json.total).toBe(1);
    expect((await get("to=2031-03-15")).json.total).toBe(1);
    expect((await get("from=2031-05-01")).json.total).toBe(0);
    expect((await get("status=bogus")).status).toBe(400);
  });
});
