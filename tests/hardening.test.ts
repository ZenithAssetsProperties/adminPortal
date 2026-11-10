/* eslint-disable @typescript-eslint/no-explicit-any */
/** Regression tests for the issues found in the security review. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { settlePayment } from "@/lib/payments";
import { startPayment } from "@/lib/checkout";
import { anon, asCustomer, asStaff, makeCustomer, makeProperty, makeStaff, uniq } from "./helpers";

async function deal(opts: { price?: number; customer?: Awaited<ReturnType<typeof makeCustomer>>; property?: Awaited<ReturnType<typeof makeProperty>>; paymentKobo?: number; kind?: "full" | "deposit" } = {}) {
  const customer = opts.customer ?? (await makeCustomer({ emailVerified: true }));
  const property = opts.property ?? (await makeProperty({ priceKobo: opts.price ?? 100_000_00 }));
  const [tx] = await db.insert(schema.transactions).values({ reference: `TXN-H${uniq()}`, customerId: customer.id, propertyId: property.id, priceKobo: property.priceKobo }).returning();
  const [payment] = await db.insert(schema.payments).values({
    reference: `PAY-H${uniq()}`, transactionId: tx.id, customerId: customer.id, kind: opts.kind ?? "full", amountKobo: opts.paymentKobo ?? property.priceKobo,
  }).returning();
  return { customer, property, tx, payment };
}
const propStatus = async (id: string) => (await db.select().from(schema.properties).where(eq(schema.properties.id, id)))[0].status;

describe("money: late or conflicting payments never win a property", () => {
  it("a payment from a buyer who lost the property is recorded but flagged, and the property stays with the holder", async () => {
    const property = await makeProperty({ priceKobo: 100_000_00 });
    const holder = await makeCustomer({ emailVerified: true });
    await db.insert(schema.reservations).values({ propertyId: property.id, customerId: holder.id, status: "active", amountKobo: 0, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.update(schema.properties).set({ status: "reserved" }).where(eq(schema.properties.id, property.id));
    const late = await deal({ property });
    const r = await settlePayment(late.payment.reference, late.payment.amountKobo);
    expect((r as any).review).toMatch(/another buyer/);
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, late.payment.id)))[0].status).toBe("success"); // real money is on record
    expect(await propStatus(property.id)).toBe("reserved");                                                                       // property NOT sold
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, late.tx.id)))[0].stage).toBe("property_selected");
    const log = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "payment.needs_review"), eq(schema.auditLogs.entityId, late.payment.id)));
    expect(log).toHaveLength(1);
  });

  it("two buyers paying in full for one unreserved property: only the first gets it", async () => {
    const property = await makeProperty({ priceKobo: 50_000_00 });
    const a = await deal({ property }); const b = await deal({ property });
    await settlePayment(a.payment.reference, a.payment.amountKobo);
    expect(await propStatus(property.id)).toBe("sold");
    const second = await settlePayment(b.payment.reference, b.payment.amountKobo);
    expect((second as any).review).toBeTruthy();
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, b.tx.id)))[0].stage).toBe("property_selected");
  });

  it("a payment on a cancelled transaction is flagged, not applied", async () => {
    const d = await deal();
    await db.update(schema.transactions).set({ stage: "cancelled" }).where(eq(schema.transactions.id, d.tx.id));
    expect(((await settlePayment(d.payment.reference, d.payment.amountKobo)) as any).review).toMatch(/cancelled/);
    expect(await propStatus(d.property.id)).toBe("available");
  });

  it("overpayment (two payments adding past the price) is flagged for refund", async () => {
    const d = await deal({ paymentKobo: 100_000_00 });
    await settlePayment(d.payment.reference, d.payment.amountKobo);
    const [extra] = await db.insert(schema.payments).values({ reference: `PAY-H${uniq()}`, transactionId: d.tx.id, customerId: d.customer.id, kind: "full", amountKobo: 100_000_00 }).returning();
    expect(((await settlePayment(extra.reference, extra.amountKobo)) as any).review).toMatch(/more than the price/);
  });

  it("starting a second payment while one is open is refused", async () => {
    const d = await deal({ kind: "deposit", paymentKobo: 1_00 }); // leaves a pending payment behind
    await expect(startPayment(d.customer, { transactionId: d.tx.id, kind: "full", amountKobo: d.property.priceKobo, acceptTerms: true })).rejects.toMatchObject({ status: 409 });
  });

  it("cannot start paying for a property someone else already holds", async () => {
    const property = await makeProperty({ priceKobo: 100_000_00 });
    const holder = await makeCustomer({ emailVerified: true });
    await db.insert(schema.reservations).values({ propertyId: property.id, customerId: holder.id, status: "active", amountKobo: 0, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.update(schema.properties).set({ status: "reserved" }).where(eq(schema.properties.id, property.id));
    const d = await deal({ property });
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.transactionId, d.tx.id));
    await expect(startPayment(d.customer, { transactionId: d.tx.id, kind: "full", amountKobo: property.priceKobo, acceptTerms: true })).rejects.toMatchObject({ status: 409 });
  });
});

describe("reservations cannot be abused to lock listings", () => {
  it("a free reservation needs a verified email", async () => {
    const p = await makeProperty({ reservationFeeKobo: 0 });
    const unverified = await makeCustomer();
    const r = await asCustomer(unverified.token, "/api/v1/reservations", { body: { propertySlug: p.slug, acceptTerms: true } });
    expect(r.status).toBe(403);
    expect(await propStatus(p.id)).toBe("available");
  });

  it("one account can hold at most three reservations", async () => {
    const c = await makeCustomer({ emailVerified: true });
    for (let i = 0; i < 3; i++) {
      const p = await makeProperty({ reservationFeeKobo: 0 });
      expect((await asCustomer(c.token, "/api/v1/reservations", { body: { propertySlug: p.slug, acceptTerms: true } })).status).toBe(201);
    }
    const p4 = await makeProperty({ reservationFeeKobo: 0 });
    expect((await asCustomer(c.token, "/api/v1/reservations", { body: { propertySlug: p4.slug, acceptTerms: true } })).status).toBe(409);
    expect(await propStatus(p4.id)).toBe("available");
  });

  it("a half-finished checkout is not renewed with a fresh hold", async () => {
    const c = await makeCustomer({ emailVerified: true });
    const p = await makeProperty({ reservationFeeKobo: 5_000_00 });
    await db.insert(schema.reservations).values({ propertyId: p.id, customerId: c.id, status: "pending", amountKobo: 5_000_00, expiresAt: new Date(Date.now() + 10 * 60_000) });
    expect((await asCustomer(c.token, "/api/v1/reservations", { body: { propertySlug: p.slug, acceptTerms: true } })).status).toBe(409);
  });
});

describe("staff cannot bypass review or re-open a property being bought", () => {
  it("content staff cannot make an approved document public or hand it to another customer", async () => {
    const content = await makeStaff("content"); const admin = await makeStaff("admin");
    const cust = await makeCustomer(); const other = await makeCustomer();
    const [doc] = await db.insert(schema.documents).values({ groupId: crypto.randomUUID(), title: "Title doc", storageKey: `documents/t/${uniq()}.pdf`, mimeType: "application/pdf", sizeBytes: 10, status: "approved", visibility: "customer_only", customerId: cust.id }).returning();
    expect((await asStaff(content.cookie, `/api/admin/documents/${doc.id}`, { method: "PATCH", body: { visibility: "public" } })).status).toBe(403);
    expect((await asStaff(content.cookie, `/api/admin/documents/${doc.id}`, { method: "PATCH", body: { customerId: other.id } })).status).toBe(403);
    expect((await asStaff(content.cookie, `/api/admin/documents/${doc.id}`, { method: "PATCH", body: { title: "Renamed" } })).status).toBe(200); // harmless edits still fine
    expect((await asStaff(admin.cookie, `/api/admin/documents/${doc.id}`, { method: "PATCH", body: { visibility: "request_only" } })).status).toBe(200);
  });

  it("a reserved or paid-for property cannot be set back to available", async () => {
    const admin = await makeStaff("admin");
    const p = await makeProperty({ status: "reserved" });
    const c = await makeCustomer();
    await db.insert(schema.reservations).values({ propertyId: p.id, customerId: c.id, status: "active", amountKobo: 0, expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await asStaff(admin.cookie, `/api/admin/properties/${p.id}/status`, { body: { status: "available" } })).status).toBe(409);
    expect((await asStaff(admin.cookie, `/api/admin/properties/${p.id}`, { method: "PATCH", body: { status: "draft" } })).status).toBe(409);
    expect((await asStaff(admin.cookie, `/api/admin/properties/${p.id}/status`, { body: { status: "sold" } })).status).toBe(200);
  });

  it("staff cannot open a transaction on a sold property", async () => {
    const fin = await makeStaff("finance"); const c = await makeCustomer();
    const p = await makeProperty({ status: "sold" });
    expect((await asStaff(fin.cookie, "/api/admin/transactions", { body: { customerId: c.id, propertyId: p.id } })).status).toBe(409);
  });
});

describe("sales agents see only their own customers", () => {
  it("customer list and detail are limited to customers tied to the agent's leads or transactions", async () => {
    const agent = await makeStaff("sales_agent"); const other = await makeStaff("sales_agent");
    const mine = await makeCustomer(); const theirs = await makeCustomer(); const nobody = await makeCustomer();
    await db.insert(schema.leads).values({ name: "L1", customerId: mine.id, agentId: agent.id });
    await db.insert(schema.leads).values({ name: "L2", customerId: theirs.id, agentId: other.id });
    const list = await asStaff(agent.cookie, "/api/admin/customers?pageSize=100");
    const ids = list.json.items.map((c: any) => c.id);
    expect(ids).toContain(mine.id); expect(ids).not.toContain(theirs.id); expect(ids).not.toContain(nobody.id);
    expect((await asStaff(agent.cookie, `/api/admin/customers/${mine.id}`)).status).toBe(200);
    expect((await asStaff(agent.cookie, `/api/admin/customers/${theirs.id}`)).status).toBe(404);
    // an admin still sees everyone
    const admin = await makeStaff("admin");
    expect((await asStaff(admin.cookie, `/api/admin/customers/${theirs.id}`)).status).toBe(200);
  });
  it("sales agents cannot open the document vault or reservations list", async () => {
    const agent = await makeStaff("sales_agent");
    expect((await asStaff(agent.cookie, "/api/admin/documents")).status).toBe(403);
    expect((await asStaff(agent.cookie, "/api/admin/reservations")).status).toBe(403);
  });
});

describe("inspection form cannot be used to spam a third party", () => {
  it("caps requests per phone number even when the IP changes", async () => {
    const p = await makeProperty();
    const phone = `080${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const send = (i: number) => anon("/api/v1/inspections", { body: { propertySlug: p.slug, kind: "physical", name: "Victim", phone, preferredDate: date, preferredTime: "10:00", visitors: 1 }, headers: { "X-Forwarded-For": `198.51.100.${i}` } });
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await send(i)).status);
    expect(results.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });
});
