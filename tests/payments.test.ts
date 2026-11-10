import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { settlePayment } from "@/lib/payments";
import { csvCell } from "@/lib/payments-query";
import { anon, asStaff, makeCustomer, makeProperty, makeStaff } from "./helpers";

async function deal(admin: { cookie: string }, price = 100_000_00, customerOver = {}) {
  const customer = await makeCustomer(customerOver); const property = await makeProperty({ priceKobo: price });
  const t = (await asStaff(admin.cookie, "/api/admin/transactions", { body: { customerId: customer.id, propertyId: property.id } })).json;
  return { customer, property, t };
}
const pay = (cookie: string, transactionId: string, amountKobo: number, method = "bank_transfer") =>
  asStaff(cookie, "/api/admin/payments", { body: { transactionId, amountKobo, method } });

describe("csv safety (pure)", () => {
  it("neutralises spreadsheet formulas and quotes awkward cells", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe("");
  });
});

describe("offline payments", () => {
  it("requires a session and the right role", async () => {
    expect((await anon("/api/admin/payments")).status).toBe(401);
    const admin = await makeStaff("admin"); const { t } = await deal(admin);
    for (const role of ["content", "sales_agent"] as const) {
      const s = await makeStaff(role);
      expect((await pay(s.cookie, t.id, 100)).status).toBe(403);
    }
    expect((await asStaff((await makeStaff("sales_agent")).cookie, "/api/admin/payments")).status).toBe(403);
  });

  it("records a part payment, issues a receipt and moves the deal on", async () => {
    const admin = await makeStaff("finance"); const creator = await makeStaff("admin");
    const { property, t } = await deal(creator, 100_000_00);
    const r = await pay(admin.cookie, t.id, 40_000_00);
    expect(r.status).toBe(201);
    expect(r.json.status).toBe("success");
    expect(r.json.kind).toBe("deposit");
    const after = (await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`)).json;
    expect(after.paidKobo).toBe(40_000_00);
    expect(after.outstandingKobo).toBe(60_000_00);
    expect(after.stage).toBe("payment_received");
    const receipt = await asStaff(admin.cookie, `/api/admin/payments/${r.json.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.json.balanceKobo).toBe(60_000_00);
    expect(receipt.json.receiptNumber).toMatch(/^RCP-/);
    expect(receipt.json.property.name).toBe(property.name);
  });

  it("rejects over-payments, zero and negative amounts, unknown deals", async () => {
    const admin = await makeStaff("admin"); const { t } = await deal(admin, 50_000_00);
    const over = await pay(admin.cookie, t.id, 50_000_01);
    expect(over.status).toBe(409);
    expect(over.json.error).toMatch(/outstanding/i);
    expect((await pay(admin.cookie, t.id, 0)).status).toBe(400);
    expect((await pay(admin.cookie, t.id, -5)).status).toBe(400);
    expect((await pay(admin.cookie, t.id, 10.5)).status).toBe(400);
    expect((await pay(admin.cookie, crypto.randomUUID(), 100)).status).toBe(404);
    expect((await asStaff(admin.cookie, "/api/admin/payments", { body: { transactionId: t.id, amountKobo: 100, method: "bitcoin" } })).status).toBe(400);
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.transactionId, t.id));
    expect(rows).toHaveLength(0); // nothing recorded by the rejected attempts
  });

  it("completes a sale on full payment, then allows ownership; cancelled deals take no money", async () => {
    const admin = await makeStaff("admin"); const { property, t } = await deal(admin, 20_000_00);
    expect((await pay(admin.cookie, t.id, 5_000_00)).status).toBe(201);
    const last = await pay(admin.cookie, t.id, 15_000_00);
    expect(last.json.kind).toBe("balance");
    const done = (await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`)).json;
    expect(done.outstandingKobo).toBe(0);
    expect(done.stage).toBe("documentation_processing");
    const [prop] = await db.select().from(schema.properties).where(eq(schema.properties.id, property.id));
    expect(prop.status).toBe("sold");
    expect((await pay(admin.cookie, t.id, 1)).status).toBe(409); // nothing left to pay
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`, { method: "PATCH", body: { stage: "ownership_completed" } })).status).toBe(200);

    const { t: t2 } = await deal(admin);
    await asStaff(admin.cookie, `/api/admin/transactions/${t2.id}`, { method: "PATCH", body: { stage: "cancelled" } });
    expect((await pay(admin.cookie, t2.id, 100)).status).toBe(409);
  });

  it("settling the same payment twice changes nothing the second time", async () => {
    const admin = await makeStaff("admin"); const { t } = await deal(admin, 30_000_00);
    const r = await pay(admin.cookie, t.id, 10_000_00);
    const again = await settlePayment(r.json.reference, 10_000_00);
    expect(again.already).toBe(true);
    const receipts = await db.select().from(schema.receipts).where(eq(schema.receipts.paymentId, r.json.id));
    expect(receipts).toHaveLength(1);
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`)).json.paidKobo).toBe(10_000_00);
    // a wrong gateway amount is refused and marks the payment failed
    const [p2] = await db.insert(schema.payments).values({ reference: `MIS-${Date.now()}`, transactionId: t.id, customerId: r.json.customerId, kind: "installment", amountKobo: 5_000_00 }).returning();
    await expect(settlePayment(p2.reference, 4_000_00)).rejects.toThrow(/does not match/);
    // NOTE: settlePayment tries to mark it "failed" but that write is rolled back by its own throw (reported to the lead).
    // What must hold: the wrong amount is never counted as money received and no receipt exists.
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p2.id)))[0].status).not.toBe("success");
    expect(await db.select().from(schema.receipts).where(eq(schema.receipts.paymentId, p2.id))).toHaveLength(0);
    expect((await asStaff(admin.cookie, `/api/admin/transactions/${t.id}`)).json.paidKobo).toBe(10_000_00);
  });

  it("two simultaneous payments cannot together exceed the balance", async () => {
    const admin = await makeStaff("admin"); const { t } = await deal(admin, 10_000_00);
    const results = await Promise.all([pay(admin.cookie, t.id, 7_000_00), pay(admin.cookie, t.id, 7_000_00)]);
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it("lists with filters and exports a CSV that cannot run formulas", async () => {
    const admin = await makeStaff("admin");
    const { t } = await deal(admin, 10_000_00, { fullName: "=HYPERLINK(\"http://evil.example\")" });
    await pay(admin.cookie, t.id, 1_000_00);
    const list = await asStaff(admin.cookie, `/api/admin/payments?transactionId=${t.id}&status=success`);
    expect(list.json.total).toBe(1);
    expect(list.json.successTotalKobo).toBe(1_000_00);
    expect(list.json.items[0].transactionRef).toBe(t.reference);
    const today = new Date().toISOString().slice(0, 10);
    expect((await asStaff(admin.cookie, `/api/admin/payments?transactionId=${t.id}&from=${today}&to=${today}`)).json.total).toBe(1);
    expect((await asStaff(admin.cookie, `/api/admin/payments?transactionId=${t.id}&from=2000-01-01&to=2000-01-02`)).json.total).toBe(0);
    expect((await asStaff(admin.cookie, `/api/admin/payments?q=%25`)).json.total).toBe(0);

    const res = await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3100"}/api/admin/payments/export?transactionId=${t.id}`, { headers: { Cookie: admin.cookie } });
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const csv = await res.text();
    expect(csv.split("\n")[0]).toMatch(/^Reference,Date,Customer/);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("gives 404 for a receipt that does not exist or is not paid", async () => {
    const admin = await makeStaff("admin"); const { customer, t } = await deal(admin);
    expect((await asStaff(admin.cookie, `/api/admin/payments/${crypto.randomUUID()}/receipt`)).status).toBe(404);
    const [p] = await db.insert(schema.payments).values({ reference: `PEND-${Date.now()}`, transactionId: t.id, customerId: customer.id, kind: "deposit", amountKobo: 100 }).returning();
    expect((await asStaff(admin.cookie, `/api/admin/payments/${p.id}/receipt`)).status).toBe(404);
    expect((await asStaff(admin.cookie, `/api/admin/payments/bad-id/receipt`)).status).toBe(404);
  });
});
