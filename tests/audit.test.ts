import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { anon, asStaff, makeStaff, uniq } from "./helpers";

describe("audit log", () => {
  it("only audit.read roles can see it", async () => {
    expect((await anon("/api/admin/audit")).status).toBe(401);
    for (const r of ["sales_agent", "finance", "content"] as const) expect((await asStaff((await makeStaff(r)).cookie, "/api/admin/audit")).status).toBe(403);
    expect((await asStaff((await makeStaff("admin")).cookie, "/api/admin/audit")).status).toBe(200);
  });

  it("filters by action prefix, actor type, entity, date and shows staff names", async () => {
    const admin = await makeStaff("admin");
    const tag = `t${uniq()}`;
    await audit({ type: "staff", id: admin.id }, `${tag}.create`, { entity: "widget", entityId: "1" });
    await audit({ type: "staff", id: admin.id }, `${tag}.delete`, { entity: "widget", entityId: "2" });
    await audit({ type: "system" }, `${tag}.cron`, { entity: "job" });
    await db.insert(schema.auditLogs).values({ actorType: "customer", action: `${tag}.login`, entity: "customer", createdAt: new Date(Date.now() - 10 * 86_400_000) });

    const all = (await asStaff(admin.cookie, `/api/admin/audit?action=${tag}`)).json;
    expect(all.total).toBe(4);
    const created = (await asStaff(admin.cookie, `/api/admin/audit?action=${tag}.create`)).json;
    expect(created.items).toHaveLength(1);
    expect(created.items[0].actorName).toBe(admin.name);
    expect((await asStaff(admin.cookie, `/api/admin/audit?action=${tag}&actorType=system`)).json.total).toBe(1);
    expect((await asStaff(admin.cookie, `/api/admin/audit?action=${tag}&entity=widget`)).json.total).toBe(2);

    const today = new Date().toISOString().slice(0, 10);
    expect((await asStaff(admin.cookie, `/api/admin/audit?action=${tag}&from=${today}`)).json.total).toBe(3); // old customer row excluded
    expect((await asStaff(admin.cookie, `/api/admin/audit?action=${tag}&to=${today}`)).json.total).toBe(4);   // 'to' is inclusive of the whole day
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    expect((await asStaff(admin.cookie, `/api/admin/audit?action=${tag}&to=${old}`)).json.total).toBe(1);

    const page = (await asStaff(admin.cookie, `/api/admin/audit?action=${tag}&pageSize=2&page=2`)).json;
    expect(page.items).toHaveLength(2);
    expect((await asStaff(admin.cookie, "/api/admin/audit?from=yesterday")).status).toBe(400);
    // % in the prefix is literal, not a wildcard
    expect((await asStaff(admin.cookie, "/api/admin/audit?action=%25")).json.total).toBe(0);
  });

  it("is read-only", async () => {
    const admin = await makeStaff("super_admin");
    for (const method of ["POST", "PATCH", "DELETE"]) expect([404, 405]).toContain((await asStaff(admin.cookie, "/api/admin/audit", { method, body: {} })).status);
  });
});
