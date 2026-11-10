/* eslint-disable @typescript-eslint/no-explicit-any -- live API responses are untyped JSON */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { anon, asCustomer, asStaff, makeCustomer, makeProperty, makeStaff } from "./helpers";
import { makeDeal, makeDoc, resetRateLimits, uniq } from "./v1-helpers";

beforeAll(resetRateLimits);

describe("customer data isolation", () => {
  it("one customer can never read another's transactions, payments or documents", async () => {
    const a = await makeDeal(); // customer A with a transaction + pending payment
    const b = await makeCustomer();
    await db.update(schema.payments).set({ status: "success", paidAt: new Date() }).where(eq(schema.payments.id, a.payment.id));
    const docA = await makeDoc({ customerId: a.customer.id, propertyId: a.property.id, transactionId: a.tx.id, title: "A's deed" });

    // A sees their own
    expect((await asCustomer(a.customer.token, `/api/v1/transactions/${a.tx.id}`)).status).toBe(200);
    expect((await asCustomer(a.customer.token, "/api/v1/transactions")).json.items).toHaveLength(1);
    expect((await asCustomer(a.customer.token, "/api/v1/payments")).json.items[0].reference).toBe(a.payment.reference);
    expect((await asCustomer(a.customer.token, `/api/v1/documents/${docA.id}/download`)).json.url).toContain("/api/files?key=");

    // B sees none of it; foreign ids look exactly like missing ones (404, not 403)
    expect((await asCustomer(b.token, `/api/v1/transactions/${a.tx.id}`)).status).toBe(404);
    expect((await asCustomer(b.token, "/api/v1/transactions")).json.items).toHaveLength(0);
    expect((await asCustomer(b.token, "/api/v1/payments")).json.items).toHaveLength(0);
    expect((await asCustomer(b.token, "/api/v1/documents")).json.items).toHaveLength(0);
    expect((await asCustomer(b.token, "/api/v1/me/properties")).json.items).toHaveLength(0);
    expect((await asCustomer(b.token, `/api/v1/documents/${docA.id}/download`)).status).toBe(404);
    expect((await asCustomer(b.token, `/api/v1/documents/${docA.id}/share`, { body: {} })).status).toBe(404);
    expect((await asCustomer(b.token, `/api/v1/payments/verify?reference=${a.payment.reference}`)).status).toBe(404);
    expect((await asCustomer(b.token, "/api/v1/payments/initialize", { body: { transactionId: a.tx.id, kind: "full", amountKobo: 100, acceptTerms: true } })).status).toBe(404);
    expect((await asCustomer(b.token, "/api/v1/transactions/not-a-uuid")).status).toBe(404);
    expect((await anon(`/api/v1/documents/${docA.id}/download`)).status).toBe(401);
  }, 120_000); // first hit of each route compiles it in the dev server, so allow time

  it("only approved documents appear in the vault, with version history", async () => {
    const c = await makeCustomer();
    const group = crypto.randomUUID();
    await makeDoc({ customerId: c.id, groupId: group, version: 1, title: "Agreement v1" });
    const v2 = await makeDoc({ customerId: c.id, groupId: group, version: 2, title: "Agreement v2" });
    const pending = await makeDoc({ customerId: c.id, status: "pending", title: "Not yet approved" });
    const r = await asCustomer(c.token, "/api/v1/documents");
    expect(r.json.items).toHaveLength(1);
    expect(r.json.items[0]).toMatchObject({ id: v2.id, version: 2, title: "Agreement v2" });
    expect(r.json.items[0].previousVersions).toHaveLength(1);
    expect(JSON.stringify(r.json)).not.toContain("storageKey");
    expect((await asCustomer(c.token, `/api/v1/documents/${pending.id}/download`)).status).toBe(404);
    const share = await asCustomer(c.token, `/api/v1/documents/${v2.id}/share`, { body: {} });
    expect(share.json.expiresInSeconds).toBe(3600);
    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, v2.id));
    expect(audits.some((x) => x.action === "document.share")).toBe(true);
  });

  it("property documents: request access, blocked until staff approve, public ones open to any customer", async () => {
    const prop = await makeProperty();
    const sensitive = await makeDoc({ propertyId: prop.id, kind: "certificate_of_occupancy", visibility: "request_only" });
    const open = await makeDoc({ propertyId: prop.id, kind: "survey_plan", visibility: "public" });
    const c = await makeCustomer();
    expect((await asCustomer(c.token, `/api/v1/documents/${sensitive.id}/download`)).status).toBe(404);
    expect((await asCustomer(c.token, `/api/v1/documents/${open.id}/download`)).status).toBe(200);

    const req = await asCustomer(c.token, `/api/v1/properties/${prop.slug}/documents/certificate_of_occupancy/request-access`, { body: {} });
    expect(req.status).toBe(202); expect(req.json.status).toBe("pending");
    expect((await asCustomer(c.token, `/api/v1/documents/${sensitive.id}/download`)).status).toBe(404); // pending is not enough
    expect((await asCustomer(c.token, `/api/v1/properties/${prop.slug}/documents/survey_plan/request-access`, { body: {} })).status).toBe(400); // already public
    expect((await asCustomer(c.token, `/api/v1/properties/${prop.slug}/documents/bogus/request-access`, { body: {} })).status).toBe(400);
    expect((await asCustomer(c.token, `/api/v1/properties/${prop.slug}/documents/deed_of_assignment/request-access`, { body: {} })).status).toBe(404);

    await db.update(schema.documentAccess).set({ status: "approved" }).where(eq(schema.documentAccess.documentId, sensitive.id));
    expect((await asCustomer(c.token, `/api/v1/documents/${sensitive.id}/download`)).status).toBe(200);
    const other = await makeCustomer();                                                            // the grant is personal
    expect((await asCustomer(other.token, `/api/v1/documents/${sensitive.id}/download`)).status).toBe(404);
  });
});

describe("transactions, my properties and dashboard", () => {
  it("shows the six-step timeline, balances and documentation state", async () => {
    const d = await makeDeal({ price: 100_000_00, pay: 40_000_00 });
    await db.update(schema.payments).set({ status: "success", paidAt: new Date() }).where(eq(schema.payments.id, d.payment.id));
    await db.update(schema.transactions).set({ stage: "payment_received" }).where(eq(schema.transactions.id, d.tx.id));
    await db.insert(schema.transactionEvents).values({ transactionId: d.tx.id, stage: "payment_received", note: "x" });
    const t = (await asCustomer(d.customer.token, `/api/v1/transactions/${d.tx.id}`)).json;
    expect(t).toMatchObject({ paidKobo: 40_000_00, outstandingKobo: 60_000_00 });
    expect(t.timeline.map((s: any) => s.state)).toEqual(["done", "done", "done", "current", "pending", "pending"]);
    const mine = (await asCustomer(d.customer.token, "/api/v1/me/properties")).json.items[0];
    expect(mine).toMatchObject({ status: "Payment received", priceKobo: 100_000_00, paidKobo: 40_000_00, outstandingKobo: 60_000_00, documentation: "pending" });
    const dash = (await asCustomer(d.customer.token, "/api/v1/dashboard")).json;
    expect(dash).toMatchObject({ transactions: 1, totalPaidKobo: 40_000_00, totalOutstandingKobo: 60_000_00 });
    expect(JSON.stringify(mine)).not.toMatch(/latitude|longitude/);
  });
});

describe("reservations", () => {
  it("fee 0: reserves immediately, marks the property reserved, blocks a second buyer", async () => {
    const p = await makeProperty({ reservationFeeKobo: 0 });
    const a = await makeCustomer({ emailVerified: true }); const b = await makeCustomer({ emailVerified: true });
    expect((await asCustomer(a.token, "/api/v1/reservations", { body: { propertySlug: p.slug, acceptTerms: false } })).status).toBe(400);
    const r = await asCustomer(a.token, "/api/v1/reservations", { body: { propertySlug: p.slug, acceptTerms: true } });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ reservationStatus: "active", authorizationUrl: null, amountKobo: 0 });
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, p.id)))[0].status).toBe("reserved");
    expect((await asCustomer(b.token, "/api/v1/reservations", { body: { propertySlug: p.slug, acceptTerms: true } })).status).toBe(409);
    const tx = (await asCustomer(a.token, `/api/v1/transactions/${r.json.transactionId}`)).json;
    expect(tx.stage).toBe("reservation_confirmed");
    expect((await asCustomer(a.token, "/api/v1/reservations")).json.items[0].status).toBe("active");
  });
  it("refuses drafts, unknown and already-sold properties", async () => {
    const c = await makeCustomer();
    const draft = await makeProperty({ status: "draft" }); const sold = await makeProperty({ status: "sold" });
    expect((await asCustomer(c.token, "/api/v1/reservations", { body: { propertySlug: draft.slug, acceptTerms: true } })).status).toBe(404);
    expect((await asCustomer(c.token, "/api/v1/reservations", { body: { propertySlug: sold.slug, acceptTerms: true } })).status).toBe(409);
    expect((await asCustomer(c.token, "/api/v1/reservations", { body: { propertySlug: "nope", acceptTerms: true } })).status).toBe(404);
  });
  it("payment initialise checks input before touching the gateway", async () => {
    const d = await makeDeal({ price: 100_000_00, pay: 10_000_00 });
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.transactionId, d.tx.id)); // nothing in flight
    const t = d.customer.token;
    const init = (body: object) => asCustomer(t, "/api/v1/payments/initialize", { body: { transactionId: d.tx.id, acceptTerms: true, ...body } });
    expect((await init({ kind: "full", amountKobo: 5_000_00 })).status).toBe(400);              // full must equal what is owed
    expect((await init({ kind: "deposit", amountKobo: 200_000_00 })).status).toBe(400);         // more than the price
    expect((await init({ kind: "full", amountKobo: -5 })).status).toBe(400);
    expect((await init({ kind: "full", amountKobo: 100_000_00, acceptTerms: false })).status).toBe(400);
    expect((await init({ kind: "installment", amountKobo: 1_000_00 })).status).toBe(400);       // no plan on this property
  });
});

describe("favorites, alerts and notifications", () => {
  it("favorites: save, list, remove; drafts cannot be saved", async () => {
    const c = await makeCustomer(); const p = await makeProperty(); const d = await makeProperty({ status: "draft" });
    expect((await asCustomer(c.token, `/api/v1/favorites/${d.id}`, { method: "PUT" })).status).toBe(404);
    expect((await asCustomer(c.token, `/api/v1/favorites/${p.id}`, { method: "PUT" })).status).toBe(200);
    expect((await asCustomer(c.token, `/api/v1/favorites/${p.id}`, { method: "PUT" })).status).toBe(200); // saving twice is harmless
    expect((await asCustomer(c.token, "/api/v1/favorites")).json.items.map((i: any) => i.id)).toEqual([p.id]);
    expect((await asCustomer(c.token, `/api/v1/favorites/${p.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await asCustomer(c.token, "/api/v1/favorites")).json.items).toHaveLength(0);
    expect((await asCustomer(c.token, "/api/v1/favorites/zzz", { method: "PUT" })).status).toBe(404);
  });

  it("alerts: create, validate, list, delete only your own", async () => {
    const a = await makeCustomer(); const b = await makeCustomer();
    expect((await asCustomer(a.token, "/api/v1/alerts", { body: { criteria: {} } })).status).toBe(400);
    expect((await asCustomer(a.token, "/api/v1/alerts", { body: { criteria: { city: "Lekki", sneaky: 1 } } })).status).toBe(400);
    const made = await asCustomer(a.token, "/api/v1/alerts", { body: { criteria: { city: "Lekki", minBedrooms: 4, maxPriceKobo: 200_000_000_00 } } });
    expect(made.status).toBe(201);
    expect((await asCustomer(a.token, "/api/v1/alerts")).json.items).toHaveLength(1);
    expect((await asCustomer(b.token, "/api/v1/alerts")).json.items).toHaveLength(0);
    expect((await asCustomer(b.token, `/api/v1/alerts/${made.json.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await asCustomer(a.token, `/api/v1/alerts/${made.json.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("an alert notifies the customer when staff publish a matching property, and price drops notify savers", async () => {
    const c = await makeCustomer(); const admin = await makeStaff("admin");
    const city = `Alertville${uniq()}`;
    await asCustomer(c.token, "/api/v1/alerts", { body: { criteria: { city, minBedrooms: 3 } } });
    await asStaff(admin.cookie, "/api/admin/properties", { body: { name: `Too small ${uniq()}`, type: "house", state: "Lagos", city, priceKobo: 5_000_000_00, status: "available", bedrooms: 1 } });
    const match = await asStaff(admin.cookie, "/api/admin/properties", { body: { name: `Matching ${uniq()}`, type: "house", state: "Lagos", city, priceKobo: 9_000_000_00, status: "available", bedrooms: 4 } });
    const poll = async (type: string) => { for (let i = 0; i < 20; i++) { const n = (await asCustomer(c.token, "/api/v1/notifications")).json.items.filter((x: any) => x.type === type); if (n.length) return n; await new Promise((r) => setTimeout(r, 250)); } return []; };
    const hits = await poll("alert_match");
    expect(hits).toHaveLength(1);
    expect(hits[0].body).toContain("Matching");

    await asCustomer(c.token, `/api/v1/favorites/${match.json.id}`, { method: "PUT" });
    await asStaff(admin.cookie, `/api/admin/properties/${match.json.id}`, { method: "PATCH", body: { priceKobo: 8_000_000_00 } });
    expect((await poll("price_change"))[0].body).toContain("dropped");
    await asStaff(admin.cookie, `/api/admin/properties/${match.json.id}/status`, { body: { status: "sold" } });
    expect((await poll("property_unavailable")).length).toBe(1);
  });

  it("notifications: list with unread count, mark read (only your own)", async () => {
    const a = await makeCustomer(); const b = await makeCustomer();
    await db.insert(schema.notifications).values([{ customerId: a.id, type: "t", title: "one", body: "x" }, { customerId: a.id, type: "t", title: "two", body: "y" }, { customerId: b.id, type: "t", title: "b's", body: "z" }]);
    const list = (await asCustomer(a.token, "/api/v1/notifications")).json;
    expect(list.unread).toBe(2); expect(list.items).toHaveLength(2);
    const bId = (await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, b.id)))[0].id;
    const r = await asCustomer(a.token, "/api/v1/notifications/read", { body: { ids: [bId, list.items[0].id] } });
    expect(r.json.marked).toBe(1);                                                                // b's row untouched
    expect((await db.select().from(schema.notifications).where(eq(schema.notifications.id, bId)))[0].readAt).toBeNull();
    expect((await asCustomer(a.token, "/api/v1/notifications/read", { body: {} })).json.marked).toBe(1);
    expect((await asCustomer(a.token, "/api/v1/notifications")).json.unread).toBe(0);
  });

  it("my inspections lists only the caller's bookings", async () => {
    const a = await makeCustomer(); const b = await makeCustomer(); const p = await makeProperty();
    const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const form = { propertySlug: p.slug, name: "Mine", phone: "08030001111", preferredDate: day, preferredTime: "10:00" };
    expect((await asCustomer(a.token, "/api/v1/inspections", { body: form })).status).toBe(201);
    expect((await asCustomer(a.token, "/api/v1/inspections/mine")).json.items).toHaveLength(1);
    expect((await asCustomer(b.token, "/api/v1/inspections/mine")).json.items).toHaveLength(0);
  });
});
