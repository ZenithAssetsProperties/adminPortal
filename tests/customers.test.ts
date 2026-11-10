/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { anon, asCustomer, asStaff, makeCustomer, makeProperty, makeStaff, uniq } from "./helpers";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { verifyCustomerToken } from "@/lib/auth/session";

describe("admin customers API", () => {
  it("needs a session and the customers.read permission", async () => {
    expect((await anon("/api/admin/customers")).status).toBe(401);
    const content = await makeStaff("content");
    expect((await asStaff(content.cookie, "/api/admin/customers")).status).toBe(403);
  });

  it("searches, filters and never returns password hashes", async () => {
    const admin = await makeStaff("admin");
    const tag = uniq();
    const c = await makeCustomer({ fullName: `Zed ${tag} Buyer`, passwordHash: "secret-hash" });
    await makeCustomer({ fullName: `Other ${uniq()}`, blocked: true });
    const r = await asStaff(admin.cookie, `/api/admin/customers?q=${tag}`);
    expect(r.json.total).toBe(1);
    expect(r.json.items[0].id).toBe(c.id);
    expect(JSON.stringify(r.json)).not.toContain("secret-hash");
    expect(JSON.stringify(r.json)).not.toContain("passwordHash");
    expect((await asStaff(admin.cookie, "/api/admin/customers?blocked=1&pageSize=100")).json.items.every((x: any) => x.blocked)).toBe(true);
    expect((await asStaff(admin.cookie, "/api/admin/customers?q=%25")).json.total).toBe(0);
  });

  it("shows a customer's activity read-only, without hashes or storage keys", async () => {
    const admin = await makeStaff("admin");
    const c = await makeCustomer({ passwordHash: "secret-hash" });
    const p = await makeProperty();
    await db.insert(schema.leads).values({ name: c.fullName, customerId: c.id, propertyId: p.id });
    await db.insert(schema.documents).values({ groupId: crypto.randomUUID(), title: "Receipt", customerId: c.id, storageKey: "private/key.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    const r = await asStaff(admin.cookie, `/api/admin/customers/${c.id}`);
    expect(r.status).toBe(200);
    expect(r.json.leads).toHaveLength(1);
    expect(r.json.documents).toHaveLength(1);
    const text = JSON.stringify(r.json);
    expect(text).not.toContain("secret-hash");
    expect(text).not.toContain("private/key.pdf");
    expect((await asStaff(admin.cookie, "/api/admin/customers/not-a-uuid")).status).toBe(404);
  });

  it("blocking a customer kills their existing token; unblocking does not revive it", async () => {
    const admin = await makeStaff("admin");
    const c = await makeCustomer();
    const claims = await verifyCustomerToken(c.token);
    expect(claims?.tv).toBe(0);
    expect((await asStaff(admin.cookie, `/api/admin/customers/${c.id}`, { method: "PATCH", body: { blocked: true } })).json.blocked).toBe(true);
    let [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, c.id));
    // customerRoute() rejects a token when the customer is blocked OR the token version no longer matches
    expect(row.blocked).toBe(true);
    expect(row.tokenVersion).not.toBe(claims!.tv);
    await asStaff(admin.cookie, `/api/admin/customers/${c.id}`, { method: "PATCH", body: { blocked: false } });
    [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, c.id));
    expect(row.blocked).toBe(false);
    expect(row.tokenVersion).not.toBe(claims!.tv); // old token stays dead
    // end to end, once the public API's /me exists
    const live = await asCustomer(c.token, "/api/v1/me");
    if (live.status !== 404) expect(live.status).toBe(401);
  });

  it("only staff with customers.write can block; input is validated", async () => {
    const c = await makeCustomer();
    const agent = await makeStaff("sales_agent");
    expect((await asStaff(agent.cookie, `/api/admin/customers/${c.id}`, { method: "PATCH", body: { blocked: true } })).status).toBe(403);
    const admin = await makeStaff("admin");
    expect((await asStaff(admin.cookie, `/api/admin/customers/${c.id}`, { method: "PATCH", body: { blocked: "yes" } })).status).toBe(400);
    expect((await asStaff(admin.cookie, `/api/admin/customers/${crypto.randomUUID()}`, { method: "PATCH", body: { blocked: true } })).status).toBe(404);
  });
});
