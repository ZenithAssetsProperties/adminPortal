import { describe, expect, it } from "vitest";
import { anon, asStaff, makeStaff, makeProperty } from "./helpers";

describe("dashboard", () => {
  it("requires sign-in", async () => { expect((await anon("/api/admin/dashboard")).status).toBe(401); });

  it("shows each role only what it may read", async () => {
    await makeProperty({ status: "available" });
    const admin = (await asStaff((await makeStaff("admin")).cookie, "/api/admin/dashboard")).json;
    for (const k of ["properties", "newEnquiries", "pendingInspections", "activeReservations", "revenue", "outstandingKobo", "leadsByStage", "activity"]) expect(admin).toHaveProperty(k);
    expect(admin.properties.available).toBeGreaterThanOrEqual(1);
    expect(admin.activity.source).toBe("audit");

    const finance = (await asStaff((await makeStaff("finance")).cookie, "/api/admin/dashboard")).json;
    expect(finance).toHaveProperty("revenue");
    expect(finance).toHaveProperty("outstandingKobo");
    for (const k of ["newEnquiries", "pendingInspections", "leadsByStage"]) expect(finance).not.toHaveProperty(k);
    expect(finance.activity.source).toBe("notifications");

    const content = (await asStaff((await makeStaff("content")).cookie, "/api/admin/dashboard")).json;
    expect(content).toHaveProperty("properties");
    for (const k of ["revenue", "outstandingKobo", "newEnquiries", "leadsByStage"]) expect(content).not.toHaveProperty(k);

    const sales = (await asStaff((await makeStaff("sales_agent")).cookie, "/api/admin/dashboard")).json;
    expect(sales).toHaveProperty("leadsByStage");
    expect(sales).not.toHaveProperty("revenue");
  });

  it("sales agents only count their own leads", async () => {
    const { db, schema } = await import("@/db");
    const a = await makeStaff("sales_agent"); const b = await makeStaff("sales_agent");
    await db.insert(schema.leads).values([{ name: "L1", agentId: a.id }, { name: "L2", agentId: a.id, status: "contacted" }, { name: "L3", agentId: b.id }]);
    const d = (await asStaff(a.cookie, "/api/admin/dashboard")).json;
    expect(d.leadsByStage.new).toBe(1);
    expect(d.leadsByStage.contacted).toBe(1);
  });
});
