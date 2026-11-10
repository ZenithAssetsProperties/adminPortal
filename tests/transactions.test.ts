import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ALL_STAGES, monthlyDue, outstanding, progress, stageChangeProblem, stageIndex } from "@/lib/transactions";
import { anon, asStaff, makeCustomer, makeProperty, makeStaff } from "./helpers";

describe("transaction helpers (pure)", () => {
  it("orders the stages and treats cancelled as outside the journey", () => {
    expect(stageIndex("property_selected")).toBe(0);
    expect(stageIndex("ownership_completed")).toBe(5);
    expect(stageIndex("cancelled")).toBe(-1);
    expect(ALL_STAGES).toHaveLength(7);
  });
  it("never reports a negative balance", () => {
    expect(outstanding(100, 30)).toBe(70);
    expect(outstanding(100, 150)).toBe(0);
  });
  it("only allows ownership_completed when fully paid", () => {
    expect(stageChangeProblem("ownership_completed", { priceKobo: 100, paidKobo: 99 })).toMatch(/fully paid/);
    expect(stageChangeProblem("ownership_completed", { priceKobo: 100, paidKobo: 100 })).toBeNull();
    expect(stageChangeProblem("payment_received", { priceKobo: 100, paidKobo: 0 })).toBeNull();
  });
  it("builds the progress list", () => {
    const p = progress("reservation_confirmed");
    expect(p.map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo", "todo"]);
    expect(progress("cancelled").every((s) => s.state === "todo")).toBe(true);
  });
  it("matches the PRD plan example and rounds up", () => {
    // N100m, 30% deposit, 12 months -> N70m / 12 = 5,833,333.33 -> rounded up
    expect(monthlyDue({ priceKobo: 100_000_000_00, depositPercent: 30, planMonths: 12, outstandingKobo: 100_000_000_00 })).toBe(583_333_334);
    // capped at what is still owed
    expect(monthlyDue({ priceKobo: 1000, depositPercent: 0, planMonths: 2, outstandingKobo: 100 })).toBe(100);
    expect(monthlyDue({ priceKobo: 1000, depositPercent: null, planMonths: 0, outstandingKobo: 1000 })).toBe(0);
  });
});

describe("admin transactions API", () => {
  it("requires a session", async () => {
    expect((await anon("/api/admin/transactions")).status).toBe(401);
  });

  it("creates, blocks duplicates, validates and enforces permissions", async () => {
    const admin = await makeStaff("admin"); const finance = await makeStaff("finance"); const content = await makeStaff("content");
    const customer = await makeCustomer(); const property = await makeProperty();
    const body = { customerId: customer.id, propertyId: property.id };
    expect((await asStaff(content.cookie, "/api/admin/transactions", { body })).status).toBe(403);
    const created = await asStaff(admin.cookie, "/api/admin/transactions", { body: { ...body, planMonths: 12, depositPercent: 30 } });
    expect(created.status).toBe(201);
    expect(created.json.stage).toBe("property_selected");
    expect(created.json.priceKobo).toBe(property.priceKobo);
    expect((await asStaff(admin.cookie, "/api/admin/transactions", { body })).status).toBe(409);
    expect((await asStaff(admin.cookie, "/api/admin/transactions", { body: { customerId: "nope", propertyId: property.id } })).status).toBe(400);
    expect((await asStaff(finance.cookie, `/api/admin/transactions/${created.json.id}`)).status).toBe(200);
    expect((await asStaff(finance.cookie, `/api/admin/transactions/${created.json.id}`, { method: "PATCH", body: { stage: "payment_received" } })).status).toBe(200);
    expect((await asStaff(admin.cookie, "/api/admin/transactions/not-a-uuid")).status).toBe(404);
  });

  it("changes stage with a history entry and notifies the customer; blocks ownership before full payment", async () => {
    const admin = await makeStaff("admin"); const customer = await makeCustomer(); const property = await makeProperty();
    const t = (await asStaff(admin.cookie, "/api/admin/transactions", { body: { customerId: customer.id, propertyId: property.id } })).json;
    const moved = await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { stage: "inspection_completed", note: "Seen on Tuesday" } });
    expect(moved.status).toBe(200);
    expect(moved.json.stage).toBe("inspection_completed");
    expect(moved.json.events[0].note).toBe("Seen on Tuesday");
    expect(moved.json.progress[1].state).toBe("current");
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, customer.id));
    expect(notes.some((n) => n.type === "transaction_stage" && n.body.includes("Seen on Tuesday"))).toBe(true);
    // same stage again, and ownership while unpaid
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { stage: "inspection_completed" } })).status).toBe(400);
    const blocked = await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { stage: "ownership_completed" } });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toMatch(/fully paid/);
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { stage: "nonsense" } })).status).toBe(400);
  });

  it("assigns only real, active agents and filters the list", async () => {
    const admin = await makeStaff("admin"); const agent = await makeStaff("sales_agent");
    const customer = await makeCustomer(); const property = await makeProperty();
    const t = (await asStaff(admin.cookie, "/api/admin/transactions", { body: { customerId: customer.id, propertyId: property.id } })).json;
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { agentId: crypto.randomUUID() } })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { agentId: agent.id } })).json.agentId).toBe(agent.id);

    const byCustomer = await asStaff(admin.cookie, `/api/admin/transactions?customerId=${customer.id}`);
    expect(byCustomer.json.total).toBe(1);
    expect(byCustomer.json.items[0].outstandingKobo).toBe(property.priceKobo);
    expect((await asStaff(admin.cookie, `/api/admin/transactions?customerId=${customer.id}&outstanding=1`)).json.total).toBe(1);
    expect((await asStaff(admin.cookie, `/api/admin/transactions?customerId=${customer.id}&stage=cancelled`)).json.total).toBe(0);
    expect((await asStaff(admin.cookie, `/api/admin/transactions?q=${t.reference}`)).json.total).toBe(1);

    // a sales agent only sees deals assigned to them, and cannot open others
    const other = await makeStaff("sales_agent");
    expect((await asStaff(agent.cookie, `/api/admin/transactions?customerId=${customer.id}`)).json.total).toBe(1);
    expect((await asStaff(other.cookie, `/api/admin/transactions?customerId=${customer.id}`)).json.total).toBe(0);
    expect((await asStaff(other.cookie, `/api/admin/transactions/${t.id}`)).status).toBe(403);
  });
});
