/* eslint-disable @typescript-eslint/no-explicit-any -- API responses from the shared test helper are untyped JSON */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isVisibleToCustomer } from "@/lib/documents";
import { anon, asStaff, makeCustomer, makeProperty, makeStaff, uniq } from "./helpers";

const pdf = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from(`content ${uniq()}`), Buffer.alloc(32)]);
const upload = (over: Record<string, string> = {}, file: Buffer = pdf(), name = "doc.pdf") => {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(file)], name, { type: "application/pdf" }));
  for (const [k, v] of Object.entries({ title: `Survey ${uniq()}`, kind: "survey_plan", ...over })) fd.set(k, v);
  return fd;
};

describe("documents vault", () => {
  it("needs a session and respects roles", async () => {
    expect((await anon("/api/admin/documents")).status).toBe(401);
    const p = await makeProperty();
    const finance = await makeStaff("finance");
    expect((await asStaff(finance.cookie, "/api/admin/documents")).status).toBe(403);
    expect((await asStaff(finance.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id }) })).status).toBe(403);

    const content = await makeStaff("content");
    const up = await asStaff(content.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id }) });
    expect(up.status).toBe(201);
    expect(up.json.status).toBe("pending");
    expect(up.json.storageKey).toBeUndefined();
    // content can upload but not approve or delete
    expect((await asStaff(content.cookie, `/api/admin/documents/${up.json.id}/review`, { body: { decision: "approve" } })).status).toBe(403);
    expect((await asStaff(content.cookie, `/api/admin/documents/${up.json.id}`, { method: "DELETE" })).status).toBe(403);
    // sales agents have no blanket access to the vault (it holds other customers' private documents)
    const sales = await makeStaff("sales_agent");
    expect((await asStaff(sales.cookie, `/api/admin/documents?propertyId=${p.id}`)).status).toBe(403);
    expect((await asStaff(sales.cookie, `/api/admin/documents/${up.json.id}/review`, { body: { decision: "approve" } })).status).toBe(403);
    expect((await asStaff(sales.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id }) })).status).toBe(403);
  });

  it("rejects fake files, missing owner, bad ids", async () => {
    const admin = await makeStaff("admin");
    const p = await makeProperty();
    const fake = await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id }, Buffer.from("<script>alert(1)</script> not a pdf"), "evil.pdf") });
    expect(fake.status).toBe(400);
    expect((await asStaff(admin.cookie, "/api/admin/documents", { body: upload({}) })).status).toBe(400);
    expect((await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ propertyId: "00000000-0000-4000-8000-000000000000" }) })).status).toBe(400);
    expect((await asStaff(admin.cookie, "/api/admin/documents/not-a-uuid")).status).toBe(404);
    expect((await asStaff(admin.cookie, "/api/admin/documents?propertyId=nope")).status).toBe(400);
  });

  it("keeps old versions and treats only the newest as current", async () => {
    const admin = await makeStaff("admin");
    const p = await makeProperty();
    const v1 = (await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id, title: "Deed" }) })).json;
    const v2 = await asStaff(admin.cookie, `/api/admin/documents/${v1.id}/versions`, { body: (() => { const f = new FormData(); f.set("file", new File([new Uint8Array(pdf())], "v2.pdf")); return f; })() });
    expect(v2.status).toBe(201);
    expect(v2.json.version).toBe(2);
    expect(v2.json.groupId).toBe(v1.groupId);

    const list = await asStaff(admin.cookie, `/api/admin/documents?propertyId=${p.id}`);
    expect(list.json.total).toBe(1);
    expect(list.json.items[0].id).toBe(v2.json.id);
    expect(list.json.items[0].versionCount).toBe(2);

    const detail = await asStaff(admin.cookie, `/api/admin/documents/${v1.id}`); // asking by the OLD id
    expect(detail.json.document.id).toBe(v2.json.id);
    expect(detail.json.versions.map((v: any) => v.version)).toEqual([2, 1]);
    // approving an old version is refused
    expect((await asStaff(admin.cookie, `/api/admin/documents/${v1.id}/review`, { body: { decision: "approve" } })).status).toBe(409);
    expect((await asStaff(admin.cookie, `/api/admin/documents/${v2.json.id}/review`, { body: { decision: "approve" } })).status).toBe(200);
  });

  it("approval notifies the assigned customer; assigning an approved document notifies too", async () => {
    const admin = await makeStaff("admin");
    const cust = await makeCustomer();
    const p = await makeProperty();
    const d = (await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ customerId: cust.id, propertyId: p.id, kind: "purchase_agreement" }) })).json;
    expect((await asStaff(admin.cookie, `/api/admin/documents/${d.id}/review`, { body: { decision: "approve" } })).json.status).toBe("approved");
    let notes = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, cust.id));
    expect(notes.filter((n) => n.type === "document_uploaded")).toHaveLength(1);

    // approved property document assigned later -> notifies
    const other = await makeCustomer();
    const d2 = (await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id }) })).json;
    await asStaff(admin.cookie, `/api/admin/documents/${d2.id}/review`, { body: { decision: "approve" } });
    const patched = await asStaff(admin.cookie, `/api/admin/documents/${d2.id}`, { method: "PATCH", body: { customerId: other.id, visibility: "customer_only" } });
    expect(patched.status).toBe(200);
    notes = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, other.id));
    expect(notes).toHaveLength(1);
    // can't strip the last owner
    expect((await asStaff(admin.cookie, `/api/admin/documents/${d.id}`, { method: "PATCH", body: { customerId: null, propertyId: null } })).status).toBe(400);
  });

  it("access requests: approve, deny, and never decide twice", async () => {
    const admin = await makeStaff("admin");
    const sales = await makeStaff("sales_agent");
    const p = await makeProperty();
    const doc = (await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id, title: "Governor's consent" }) })).json;
    const c1 = await makeCustomer(); const c2 = await makeCustomer();
    const [a1] = await db.insert(schema.documentAccess).values({ documentId: doc.id, customerId: c1.id }).returning();
    const [a2] = await db.insert(schema.documentAccess).values({ documentId: doc.id, customerId: c2.id }).returning();

    const pending = await asStaff(admin.cookie, "/api/admin/documents/access?status=pending&pageSize=100");
    expect(pending.json.items.map((i: any) => i.id)).toEqual(expect.arrayContaining([a1.id, a2.id]));
    expect((await asStaff(sales.cookie, `/api/admin/documents/access/${a1.id}`, { body: { decision: "approve" } })).status).toBe(403);

    expect((await asStaff(admin.cookie, `/api/admin/documents/access/${a1.id}`, { body: { decision: "approve" } })).json.status).toBe("approved");
    expect((await asStaff(admin.cookie, `/api/admin/documents/access/${a2.id}`, { body: { decision: "deny" } })).json.status).toBe("denied");
    expect((await asStaff(admin.cookie, `/api/admin/documents/access/${a1.id}`, { body: { decision: "deny" } })).status).toBe(409);
    const [row] = await db.select().from(schema.documentAccess).where(eq(schema.documentAccess.id, a1.id));
    expect(row.decidedBy).toBe(admin.id);
    expect(row.decidedAt).not.toBeNull();
    const n1 = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, c1.id));
    expect(n1[0].title).toMatch(/approved/i);
    const audited = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, a2.id));
    expect(audited.map((x) => x.action)).toContain("document.access_denied");
  });

  it("download link works and is audited; delete removes all versions", async () => {
    const admin = await makeStaff("admin");
    const p = await makeProperty();
    const d = (await asStaff(admin.cookie, "/api/admin/documents", { body: upload({ propertyId: p.id }) })).json;
    const dl = await asStaff(admin.cookie, `/api/admin/documents/${d.id}/download`);
    expect(dl.status).toBe(200);
    const file = await fetch(dl.json.url);
    expect(file.status).toBe(200);
    expect((await file.text()).startsWith("%PDF-")).toBe(true);
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, d.id));
    expect(logs.map((l) => l.action)).toContain("document.download");

    expect((await asStaff(admin.cookie, `/api/admin/documents/${d.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await asStaff(admin.cookie, `/api/admin/documents/${d.id}`)).status).toBe(404);
  });

  it("buyer visibility rule", () => {
    const base = { status: "approved", visibility: "request_only", customerId: null as string | null };
    expect(isVisibleToCustomer({ ...base, status: "pending", visibility: "public" }, "c1", true)).toBe(false);
    expect(isVisibleToCustomer({ ...base, status: "rejected", customerId: "c1" }, "c1", true)).toBe(false);
    expect(isVisibleToCustomer({ ...base, visibility: "public" }, null, false)).toBe(true);
    expect(isVisibleToCustomer(base, "c1", false)).toBe(false);
    expect(isVisibleToCustomer(base, "c1", true)).toBe(true);
    expect(isVisibleToCustomer({ ...base, visibility: "customer_only", customerId: "c1" }, "c1", false)).toBe(true);
    expect(isVisibleToCustomer({ ...base, visibility: "customer_only", customerId: "c1" }, "c2", true)).toBe(false);
  });
});
