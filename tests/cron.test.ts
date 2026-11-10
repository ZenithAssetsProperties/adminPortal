import { describe, expect, it, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { monthKey } from "@/lib/transactions";
import { BASE, anon, asStaff, makeCustomer, makeProperty, makeStaff } from "./helpers";

const SECRET = process.env.CRON_SECRET;
let live = false; // is the RUNNING server using the same CRON_SECRET?
const call = (path: string, secret?: string) => fetch(`${BASE}${path}`, { method: "POST", headers: secret ? { Authorization: `Bearer ${secret}` } : {} });

beforeAll(async () => {
  if (!SECRET) { console.warn("SKIPPING cron tests: CRON_SECRET is not in .env.local"); return; }
  live = (await call("/api/cron/expire-reservations", SECRET)).status === 200;
  if (!live) console.warn("SKIPPING cron tests: the running server does not know CRON_SECRET yet. Restart the dev server so it reads .env.local.");
});

describe("cron endpoints", () => {
  it("refuse calls without the right secret", async () => {
    for (const path of ["/api/cron/expire-reservations", "/api/cron/payment-reminders"]) {
      expect((await call(path)).status).toBe(401);
      expect((await call(path, "wrong-secret")).status).toBe(401);
      expect((await call(path, "")).status).toBe(401);
    }
    expect((await anon("/api/cron/payment-reminders")).status).toBe(401);
  });

  it("expires overdue reservations, frees the property and tells the customer", async (ctx) => {
    if (!live) return ctx.skip();
    const customer = await makeCustomer(); const property = await makeProperty({ status: "reserved" });
    const [r] = await db.insert(schema.reservations).values({ propertyId: property.id, customerId: customer.id, status: "active", expiresAt: new Date(Date.now() - 3_600_000) }).returning();
    expect((await call("/api/cron/expire-reservations", SECRET)).status).toBe(200);
    expect((await db.select().from(schema.reservations).where(eq(schema.reservations.id, r.id)))[0].status).toBe("expired");
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, property.id)))[0].status).toBe("available");
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, customer.id));
    expect(notes.some((n) => n.type === "reservation_expired")).toBe(true);
  });

  it("keeps the property reserved while another active hold exists, and never frees a sold property", async (ctx) => {
    if (!live) return ctx.skip();
    const c1 = await makeCustomer(); const c2 = await makeCustomer(); const property = await makeProperty({ status: "reserved" });
    await db.insert(schema.reservations).values({ propertyId: property.id, customerId: c1.id, status: "active", expiresAt: new Date(Date.now() - 1000) });
    await db.insert(schema.reservations).values({ propertyId: property.id, customerId: c2.id, status: "active", expiresAt: new Date(Date.now() + 5 * 86_400_000) });
    await call("/api/cron/expire-reservations", SECRET);
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, property.id)))[0].status).toBe("reserved");
    const sold = await makeProperty({ status: "sold" }); const c3 = await makeCustomer();
    await db.insert(schema.reservations).values({ propertyId: sold.id, customerId: c3.id, status: "active", expiresAt: new Date(Date.now() - 1000) });
    await call("/api/cron/expire-reservations", SECRET);
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, sold.id)))[0].status).toBe("sold");
  });

  it("sends the one-day warning exactly once", async (ctx) => {
    if (!live) return ctx.skip();
    const customer = await makeCustomer(); const property = await makeProperty({ status: "reserved" });
    const [r] = await db.insert(schema.reservations).values({ propertyId: property.id, customerId: customer.id, status: "active", expiresAt: new Date(Date.now() + 12 * 3_600_000) }).returning();
    await call("/api/cron/expire-reservations", SECRET);
    await call("/api/cron/expire-reservations", SECRET);
    const warn = await db.select().from(schema.notifications).where(and(eq(schema.notifications.customerId, customer.id), eq(schema.notifications.type, `reservation_expiring:${r.id}`)));
    expect(warn).toHaveLength(1);
    expect((await db.select().from(schema.reservations).where(eq(schema.reservations.id, r.id)))[0].status).toBe("active");
  });

  it("sends one plan reminder per month with the right amount, and skips settled deals", async (ctx) => {
    if (!live) return ctx.skip();
    const customer = await makeCustomer(); const property = await makeProperty();
    const [t] = await db.insert(schema.transactions).values({ reference: `PLAN-${Date.now()}`, customerId: customer.id, propertyId: property.id, priceKobo: 100_000_000_00, planMonths: 10, depositPercent: 30 }).returning();
    await call("/api/cron/payment-reminders", SECRET);
    await call("/api/cron/payment-reminders", SECRET);
    const type = `payment_due:${t.id}:${monthKey()}`;
    const rows = await db.select().from(schema.notifications).where(and(eq(schema.notifications.customerId, customer.id), eq(schema.notifications.type, type)));
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain("₦7,000,000 is due"); // (₦100m - 30% deposit) / 10 months
    expect(rows[0].body).toContain(t.reference);

    // fully paid -> no reminder
    const c2 = await makeCustomer(); const p2 = await makeProperty();
    const [t2] = await db.insert(schema.transactions).values({ reference: `PAID-${Date.now()}`, customerId: c2.id, propertyId: p2.id, priceKobo: 1_000_00, planMonths: 2 }).returning();
    await db.insert(schema.payments).values({ reference: `PAIDP-${Date.now()}`, transactionId: t2.id, customerId: c2.id, kind: "full", amountKobo: 1_000_00, status: "success", paidAt: new Date() });
    await call("/api/cron/payment-reminders", SECRET);
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, c2.id))).toHaveLength(0);
  });

  it("still works for a signed-in staff cookie being irrelevant (cron ignores staff sessions)", async () => {
    const admin = await makeStaff("super_admin");
    expect((await asStaff(admin.cookie, "/api/cron/payment-reminders", { method: "POST" })).status).toBe(401);
  });
});
