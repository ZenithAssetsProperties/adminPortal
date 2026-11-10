/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { asStaff, makeProperty, makeStaff, uniq } from "./helpers";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const PW = "Str0ng-Password-123";
const newAgent = () => ({ name: `Agent ${uniq()}`, email: `a-${uniq()}@zenith.test`, password: PW });

describe("agents", () => {
  it("creates an agent with a valid password and rejects weak ones and duplicates", async () => {
    const admin = await makeStaff("admin");
    const body = newAgent();
    const ok = await asStaff(admin.cookie, "/api/admin/agents", { body });
    expect(ok.status).toBe(201);
    expect(ok.json.passwordHash).toBeUndefined();
    expect((await asStaff(admin.cookie, "/api/admin/agents", { body })).status).toBe(409);
    expect((await asStaff(admin.cookie, "/api/admin/agents", { body: { ...newAgent(), password: "short" } })).status).toBe(400);
    expect((await asStaff(admin.cookie, "/api/admin/agents", { body: { ...newAgent(), email: "nope" } })).status).toBe(400);
  });

  it("lists workload counts, assigns properties and leads in bulk, and deactivates", async () => {
    const admin = await makeStaff("admin");
    const { json: agent } = await asStaff(admin.cookie, "/api/admin/agents", { body: newAgent() });
    const p1 = await makeProperty(); const p2 = await makeProperty();
    const [l1] = await db.insert(schema.leads).values({ name: "A", phone: "08000000003" }).returning();
    const r = await asStaff(admin.cookie, `/api/admin/agents/${agent.id}/assign`, { body: { propertyIds: [p1.id, p2.id], leadIds: [l1.id] } });
    expect(r.json).toEqual({ propertiesAssigned: 2, leadsAssigned: 1 });
    const list = await asStaff(admin.cookie, `/api/admin/agents?q=${encodeURIComponent(agent.name)}`);
    expect(list.json.items[0]).toMatchObject({ id: agent.id, propertyCount: 2, openLeadCount: 1 });
    const detail = await asStaff(admin.cookie, `/api/admin/agents/${agent.id}`);
    expect(detail.json.properties).toHaveLength(2);
    expect((await asStaff(admin.cookie, `/api/admin/agents/${agent.id}/assign`, { body: {} })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/agents/${agent.id}/assign`, { body: { propertyIds: ["bad"] } })).status).toBe(400);

    const [before] = await db.select().from(schema.staff).where(eq(schema.staff.id, agent.id));
    expect((await asStaff(admin.cookie, `/api/admin/agents/${agent.id}`, { method: "PATCH", body: { active: false } })).json.active).toBe(false);
    const [after] = await db.select().from(schema.staff).where(eq(schema.staff.id, agent.id));
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect((await asStaff(admin.cookie, `/api/admin/agents/${agent.id}/assign`, { body: { propertyIds: [p1.id] } })).status).toBe(400);
    expect((await asStaff(admin.cookie, "/api/admin/agents?active=1&pageSize=100")).json.items.some((a: any) => a.id === agent.id)).toBe(false);
  });

  it("only staff with agents.* permissions may manage agents; sales agents cannot", async () => {
    const agent = await makeStaff("sales_agent");
    expect((await asStaff(agent.cookie, "/api/admin/agents")).status).toBe(403);
    expect((await asStaff(agent.cookie, "/api/admin/agents", { body: newAgent() })).status).toBe(403);
    const finance = await makeStaff("finance");
    expect((await asStaff(finance.cookie, "/api/admin/agents")).status).toBe(403);
    const admin = await makeStaff("admin");
    const other = await makeStaff("finance"); // not a sales agent
    expect((await asStaff(admin.cookie, `/api/admin/agents/${other.id}`)).status).toBe(404);
  });
});

describe("staff management", () => {
  it("is super-admin only", async () => {
    const admin = await makeStaff("admin");
    expect((await asStaff(admin.cookie, "/api/admin/staff")).status).toBe(403);
    expect((await asStaff(admin.cookie, "/api/admin/staff", { body: { ...newAgent(), role: "admin" } })).status).toBe(403);
    const sa = await makeStaff("super_admin");
    const list = await asStaff(sa.cookie, "/api/admin/staff");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain("passwordHash");
    expect(JSON.stringify(list.json)).not.toContain("totpSecret");
  });

  it("creates staff of any role and validates the role", async () => {
    const sa = await makeStaff("super_admin");
    const r = await asStaff(sa.cookie, "/api/admin/staff", { body: { ...newAgent(), role: "finance" } });
    expect(r.status).toBe(201);
    expect(r.json.role).toBe("finance");
    expect((await asStaff(sa.cookie, "/api/admin/staff", { body: { ...newAgent(), role: "god" } })).status).toBe(400);
  });

  it("changes role, deactivates, resets password and 2FA, signing the person out", async () => {
    const sa = await makeStaff("super_admin");
    const t = await makeStaff("content");
    expect((await asStaff(sa.cookie, `/api/admin/staff/${t.id}`, { method: "PATCH", body: { role: "finance" } })).json.role).toBe("finance");
    expect((await asStaff(t.cookie, "/api/admin/auth/me")).status).toBe(200);
    expect((await asStaff(sa.cookie, `/api/admin/staff/${t.id}/reset-password`, { body: { password: "weak" } })).status).toBe(400);
    expect((await asStaff(sa.cookie, `/api/admin/staff/${t.id}/reset-password`, { body: { password: PW } })).status).toBe(200);
    expect((await asStaff(t.cookie, "/api/admin/auth/me")).status).toBe(401); // old session is dead
    const t2 = await makeStaff("admin");
    expect((await asStaff(sa.cookie, `/api/admin/staff/${t2.id}/reset-2fa`, { body: {} })).status).toBe(200);
    const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, t2.id));
    expect(row.totpEnabled).toBe(false);
    expect(row.totpSecret).toBeNull();
    expect((await asStaff(sa.cookie, `/api/admin/staff/${t2.id}`, { method: "PATCH", body: { active: false } })).json.active).toBe(false);
    expect((await asStaff(t2.cookie, "/api/admin/auth/me")).status).toBe(401);
    expect((await asStaff(sa.cookie, `/api/admin/staff/${t2.id}`, { method: "PATCH", body: { active: true } })).json.active).toBe(true);
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, t2.id));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["staff.2fa_reset", "staff.deactivate", "staff.reactivate"]));
  });

  it("stops you demoting or deactivating yourself", async () => {
    const sa = await makeStaff("super_admin");
    expect((await asStaff(sa.cookie, `/api/admin/staff/${sa.id}`, { method: "PATCH", body: { active: false } })).status).toBe(409);
    expect((await asStaff(sa.cookie, `/api/admin/staff/${sa.id}`, { method: "PATCH", body: { role: "admin" } })).status).toBe(409);
  });

  it("never lets the last active super admin be removed", async () => {
    // Test in isolation inside a transaction-free way: deactivate every other super admin temporarily is unsafe on a shared DB,
    // so we check the guard directly against the real database state.
    const { assertNotLastSuperAdmin } = await import("@/app/api/admin/staff/_guards");
    const sa = await makeStaff("super_admin");
    // another active super admin exists (the seeded one or this test's), so removing `sa` is allowed
    const others = await db.select().from(schema.staff).where(eq(schema.staff.role, "super_admin"));
    expect(others.filter((s) => s.active && s.id !== sa.id).length).toBeGreaterThan(0);
    await expect(assertNotLastSuperAdmin(sa.id)).resolves.toBeUndefined();
  });

  it("with only one active super admin, demoting or deactivating them (by another super admin who then is the only one) is refused", async () => {
    // Make two super admins, then check each cannot be removed once the other is inactive.
    const a = await makeStaff("super_admin");
    const b = await makeStaff("super_admin");
    const { assertNotLastSuperAdmin } = await import("@/app/api/admin/staff/_guards");
    // deactivate every OTHER active super admin directly so that only a and b remain active
    const all = await db.select().from(schema.staff).where(eq(schema.staff.role, "super_admin"));
    const restore = all.filter((s) => s.active && s.id !== a.id && s.id !== b.id).map((s) => s.id);
    try {
      for (const id of restore) await db.update(schema.staff).set({ active: false }).where(eq(schema.staff.id, id));
      // a deactivates b: allowed (a stays)
      expect((await asStaff(a.cookie, `/api/admin/staff/${b.id}`, { method: "PATCH", body: { active: false } })).status).toBe(200);
      // now a is the last one; another super admin cannot exist to act, so verify the guard directly
      await expect(assertNotLastSuperAdmin(a.id)).rejects.toMatchObject({ status: 409 });
      // and b (inactive) cannot act at all
      expect((await asStaff(b.cookie, `/api/admin/staff/${a.id}`, { method: "PATCH", body: { role: "admin" } })).status).toBe(401);
    } finally {
      for (const id of restore) await db.update(schema.staff).set({ active: true }).where(eq(schema.staff.id, id));
    }
  });
});
