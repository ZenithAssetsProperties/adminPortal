/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { asStaff, makeProperty, makeStaff, uniq } from "./helpers";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const lead = (over: object = {}) => ({ name: `Lead ${uniq()}`, phone: "08031112222", ...over });

describe("leads", () => {
  it("creates, lists and validates", async () => {
    const admin = await makeStaff("admin");
    const bad = await asStaff(admin.cookie, "/api/admin/leads", { body: { name: "Jo" } });
    expect(bad.status).toBe(400); // needs email or phone
    const ok = await asStaff(admin.cookie, "/api/admin/leads", { body: lead() });
    expect(ok.status).toBe(201);
    expect(ok.json.status).toBe("new");
    const p = await makeProperty();
    expect((await asStaff(admin.cookie, "/api/admin/leads", { body: lead({ propertyId: crypto.randomUUID() }) })).status).toBe(400);
    expect((await asStaff(admin.cookie, "/api/admin/leads", { body: lead({ propertyId: p.id }) })).status).toBe(201);
    const list = await asStaff(admin.cookie, "/api/admin/leads?status=new&pageSize=100");
    expect(list.status).toBe(200);
    expect(list.json.items.every((l: any) => l.status === "new")).toBe(true);
  });

  it("moves through the pipeline, writes audit entries and keeps notes", async () => {
    const admin = await makeStaff("admin");
    const { json: l } = await asStaff(admin.cookie, "/api/admin/leads", { body: lead() });
    const up = await asStaff(admin.cookie, `/api/admin/leads/${l.id}`, { method: "PATCH", body: { status: "contacted" } });
    expect(up.json.status).toBe("contacted");
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}`, { method: "PATCH", body: { status: "flying" } })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}`, { method: "PATCH", body: {} })).status).toBe(400);
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, l.id));
    expect(logs.some((a) => a.action === "lead.status" && (a.meta as any).to === "contacted")).toBe(true);
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}/notes`, { body: { body: "   " } })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}/notes`, { body: { body: "Called, wants viewing Friday" } })).status).toBe(201);
    const detail = await asStaff(admin.cookie, `/api/admin/leads/${l.id}`);
    expect(detail.json.notes).toHaveLength(1);
    expect(detail.json.notes[0].staffName).toContain("admin");
  });

  it("assigns only to active sales agents and notifies them", async () => {
    const admin = await makeStaff("admin");
    const agent = await makeStaff("sales_agent");
    const finance = await makeStaff("finance");
    const { json: l } = await asStaff(admin.cookie, "/api/admin/leads", { body: lead() });
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}`, { method: "PATCH", body: { agentId: finance.id } })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}`, { method: "PATCH", body: { agentId: agent.id } })).json.agentId).toBe(agent.id);
    const n = await db.select().from(schema.notifications).where(eq(schema.notifications.staffId, agent.id));
    expect(n.some((x) => x.type === "lead_assigned")).toBe(true);
    expect((await asStaff(admin.cookie, `/api/admin/leads/${l.id}`, { method: "PATCH", body: { agentId: null } })).json.agentId).toBeNull();
  });

  it("sales agents see and edit only their own leads and cannot reassign", async () => {
    const admin = await makeStaff("admin");
    const a1 = await makeStaff("sales_agent");
    const a2 = await makeStaff("sales_agent");
    const mine = (await asStaff(admin.cookie, "/api/admin/leads", { body: lead({ agentId: a1.id }) })).json;
    const theirs = (await asStaff(admin.cookie, "/api/admin/leads", { body: lead({ agentId: a2.id }) })).json;
    const list = await asStaff(a1.cookie, "/api/admin/leads?pageSize=100");
    expect(list.json.items.map((x: any) => x.id)).toEqual([mine.id]);
    expect((await asStaff(a1.cookie, `/api/admin/leads/${theirs.id}`)).status).toBe(404);
    expect((await asStaff(a1.cookie, `/api/admin/leads/${theirs.id}`, { method: "PATCH", body: { status: "lost" } })).status).toBe(404);
    expect((await asStaff(a1.cookie, `/api/admin/leads/${theirs.id}/notes`, { body: { body: "hi" } })).status).toBe(404);
    expect((await asStaff(a1.cookie, `/api/admin/leads/${mine.id}`, { method: "PATCH", body: { status: "negotiation" } })).status).toBe(200);
    expect((await asStaff(a1.cookie, `/api/admin/leads/${mine.id}`, { method: "PATCH", body: { agentId: a2.id } })).status).toBe(403);
    // an agent-created lead is auto-assigned to them, even if they try to give it away
    const created = await asStaff(a1.cookie, "/api/admin/leads", { body: lead({ agentId: a2.id }) });
    expect(created.json.agentId).toBe(a1.id);
  });

  it("denies roles without lead access", async () => {
    const content = await makeStaff("content");
    expect((await asStaff(content.cookie, "/api/admin/leads")).status).toBe(403);
    const finance = await makeStaff("finance");
    expect((await asStaff(finance.cookie, "/api/admin/leads", { body: lead() })).status).toBe(403);
  });
});

describe("enquiries", () => {
  it("manual capture becomes a lead; convert refuses a second time", async () => {
    const admin = await makeStaff("admin");
    const created = await asStaff(admin.cookie, "/api/admin/enquiries", { body: { name: `Caller ${uniq()}`, phone: "08033334444", kind: "callback" } });
    expect(created.status).toBe(201);
    expect(created.json.leadId).toBeTruthy();
    expect((await asStaff(admin.cookie, `/api/admin/enquiries/${created.json.id}/convert`, { body: {} })).status).toBe(409);
    expect((await asStaff(admin.cookie, "/api/admin/enquiries", { body: { name: "NoContact" } })).status).toBe(400);
  });

  it("an unlinked enquiry can be converted, marked handled and filtered", async () => {
    const admin = await makeStaff("admin");
    const [e] = await db.insert(schema.enquiries).values({ name: `Web ${uniq()}`, email: `w-${uniq()}@x.com`, kind: "enquiry", source: "instagram" }).returning();
    const conv = await asStaff(admin.cookie, `/api/admin/enquiries/${e.id}/convert`, { body: {} });
    expect(conv.status).toBe(201);
    expect(conv.json.source).toBe("instagram");
    expect((await asStaff(admin.cookie, `/api/admin/enquiries/${e.id}`, { method: "PATCH", body: { handled: true } })).json.handled).toBe(true);
    const open = await asStaff(admin.cookie, "/api/admin/enquiries?handled=0&kind=callback&pageSize=100");
    expect(open.json.items.every((x: any) => !x.handled && x.kind === "callback")).toBe(true);
  });

  it("sales agents only see enquiries tied to their leads", async () => {
    const admin = await makeStaff("admin");
    const a1 = await makeStaff("sales_agent");
    const a2 = await makeStaff("sales_agent");
    const [l1] = await db.insert(schema.leads).values({ name: "L1", phone: "08000000001", agentId: a1.id }).returning();
    const [l2] = await db.insert(schema.leads).values({ name: "L2", phone: "08000000002", agentId: a2.id }).returning();
    const [e1] = await db.insert(schema.enquiries).values({ name: "E1", phone: "1234567", leadId: l1.id }).returning();
    const [e2] = await db.insert(schema.enquiries).values({ name: "E2", phone: "1234567", leadId: l2.id }).returning();
    await db.insert(schema.enquiries).values({ name: "E3 orphan", phone: "1234567" });
    const seen = await asStaff(a1.cookie, "/api/admin/enquiries?pageSize=100");
    expect(seen.json.items.map((x: any) => x.id)).toEqual([e1.id]);
    expect((await asStaff(a1.cookie, `/api/admin/enquiries/${e2.id}`, { method: "PATCH", body: { handled: true } })).status).toBe(404);
    expect((await asStaff(admin.cookie, `/api/admin/enquiries/${e2.id}`, { method: "PATCH", body: { handled: true } })).status).toBe(200);
    const finance = await makeStaff("finance");
    expect((await asStaff(finance.cookie, "/api/admin/enquiries")).status).toBe(403);
  });
});
