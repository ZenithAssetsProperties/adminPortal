/* eslint-disable @typescript-eslint/no-explicit-any -- API responses from the shared test helper are untyped JSON */
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { csvCell } from "@/lib/documents";
import { anon, asStaff, makeCustomer, makeProperty, makeStaff, uniq } from "./helpers";

const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
const report = async (cookie: string, days = 30) => (await asStaff(cookie, `/api/admin/analytics?days=${days}`)).json;

describe("analytics", () => {
  it("is limited to analytics.read and validates the range", async () => {
    expect((await anon("/api/admin/analytics")).status).toBe(401);
    expect((await asStaff((await makeStaff("sales_agent")).cookie, "/api/admin/analytics")).status).toBe(403);
    const fin = await makeStaff("finance");
    expect((await asStaff(fin.cookie, "/api/admin/analytics?days=30")).status).toBe(200);
    expect((await asStaff(fin.cookie, "/api/admin/analytics?days=5")).status).toBe(400);
  });

  it("counts match the rows we seed, exactly", async () => {
    const admin = await makeStaff("admin");
    const before = await report(admin.cookie, 30);
    const p = await makeProperty({ name: `Analytics Villa ${uniq()}` });
    const term = `zz${uniq()}`;
    const s1 = `s-${uniq()}`, s2 = `s-${uniq()}`;
    const cust = await makeCustomer({ source: `src-${uniq()}` });
    const src = `chan-${uniq()}`;

    await db.insert(schema.analyticsEvents).values([
      { type: "visit", sessionId: s1 }, { type: "visit", sessionId: s1 }, { type: "visit", sessionId: s2 },
      { type: "visit", sessionId: `old-${uniq()}`, createdAt: ago(60) }, // outside the 30-day window
      { type: "property_view", propertyId: p.id }, { type: "property_view", propertyId: p.id }, { type: "property_view", propertyId: p.id },
      { type: "property_view", propertyId: p.id, createdAt: ago(60) },
      { type: "search", meta: { q: term } }, { type: "search", meta: { q: ` ${term.toUpperCase()} ` } },
      { type: "payment_started" }, { type: "payment_started" },
    ]);
    await db.insert(schema.enquiries).values([{ name: "E1" }, { name: "E2" }]);
    await db.insert(schema.leads).values([{ name: "L1", source: src }, { name: "L2", source: src }]);
    const [tx] = await db.insert(schema.transactions).values({ reference: `T-${uniq()}`, customerId: cust.id, propertyId: p.id, priceKobo: 1000, stage: "payment_received" }).returning();
    await db.insert(schema.transactions).values({ reference: `T-${uniq()}`, customerId: cust.id, propertyId: p.id, priceKobo: 1000, stage: "property_selected" });
    await db.insert(schema.payments).values([
      { reference: `P-${uniq()}`, transactionId: tx.id, customerId: cust.id, kind: "deposit", amountKobo: 500, status: "success", paidAt: new Date() },
      { reference: `P-${uniq()}`, transactionId: tx.id, customerId: cust.id, kind: "deposit", amountKobo: 500, status: "pending", createdAt: new Date(Date.now() - 2 * 3600_000) }, // abandoned
      { reference: `P-${uniq()}`, transactionId: tx.id, customerId: cust.id, kind: "deposit", amountKobo: 500, status: "pending" },              // fresh, not abandoned
    ]);

    const after = await report(admin.cookie, 30);
    expect(after.visitors - before.visitors).toBe(2);
    expect(after.propertyViews - before.propertyViews).toBe(3);
    expect(after.searches - before.searches).toBe(2);
    expect(after.payment.started - before.payment.started).toBe(2);
    expect(after.payment.successful - before.payment.successful).toBe(1);
    expect(after.enquiries - before.enquiries).toBe(2);
    expect(after.purchases - before.purchases).toBe(1);
    expect(after.abandonedTransactions - before.abandonedTransactions).toBe(1);
    expect(after.topProperties.find((x: any) => x.id === p.id)?.views).toBe(3);
    expect(after.topSearchTerms.find((x: any) => x.term === term)?.searches).toBe(2);
    expect(after.channels.find((x: any) => x.source === src)).toMatchObject({ leads: 2, purchases: 0 });
    expect(after.channels.find((x: any) => x.source === cust.source)).toMatchObject({ purchases: 1 });
    expect(after.daily).toHaveLength(31);
    expect(after.daily.at(-1).views).toBeGreaterThanOrEqual(3);

    // a 7-day window excludes older seeded rows but still has today's
    const week = await report(admin.cookie, 7);
    expect(week.daily).toHaveLength(8);
    expect(week.topProperties.find((x: any) => x.id === p.id)?.views).toBe(3);
  });

  it("exports CSV safe against formula injection", async () => {
    const admin = await makeStaff("admin");
    const p = await makeProperty({ name: `=HYPERLINK("http://evil","x") ${uniq()}` });
    await db.insert(schema.analyticsEvents).values({ type: "property_view", propertyId: p.id });
    const res = await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3100"}/api/admin/analytics/export?days=7`, { headers: { Cookie: admin.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("Visitors");
    expect(text).toContain(`"'=HYPERLINK(""http://evil"",""x"")`);
    expect(text).not.toMatch(/^=/m);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("a,b")).toBe('"a,b"');
  });
});
