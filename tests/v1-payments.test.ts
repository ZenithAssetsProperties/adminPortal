import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createReservation, paymentRuleProblem, startPayment, verifyReference } from "@/lib/checkout";
import { initializePayment, verifyWebhookSignature } from "@/lib/paystack";
import { BASE, makeCustomer, makeProperty } from "./helpers";
import { WEBHOOK_SECRET, makeDeal, paystackSig, postWebhook, resetRateLimits } from "./v1-helpers";

beforeAll(resetRateLimits);

// ---------------------------------------------------------------- pure rules
describe("paymentRuleProblem (what a customer may pay)", () => {
  const base = { priceKobo: 100_000_00, paidKobo: 0, planAvailable: true, minDepositPercent: 30, maxPlanMonths: 10 };
  it("full/balance must equal the outstanding amount", () => {
    expect(paymentRuleProblem({ ...base, kind: "full", amountKobo: 100_000_00 })).toBeNull();
    expect(paymentRuleProblem({ ...base, kind: "full", amountKobo: 99_999_00 })).toMatch(/must equal/);
    expect(paymentRuleProblem({ ...base, kind: "balance", paidKobo: 40_000_00, amountKobo: 60_000_00 })).toBeNull();
  });
  it("never allows zero, negative, fractional, or more than owed", () => {
    for (const amountKobo of [0, -1, 1.5, 100_000_01]) expect(paymentRuleProblem({ ...base, kind: "deposit", amountKobo })).not.toBeNull();
    expect(paymentRuleProblem({ ...base, kind: "full", paidKobo: 100_000_00, amountKobo: 1 })).toMatch(/fully paid/);
  });
  it("deposit must reach the minimum percentage (counting what is already paid, e.g. a reservation fee)", () => {
    expect(paymentRuleProblem({ ...base, kind: "deposit", amountKobo: 29_999_99 })).toMatch(/30%/);
    expect(paymentRuleProblem({ ...base, kind: "deposit", amountKobo: 30_000_00 })).toBeNull();
    expect(paymentRuleProblem({ ...base, kind: "deposit", paidKobo: 5_000_00, amountKobo: 25_000_00 })).toBeNull();
    expect(paymentRuleProblem({ ...base, kind: "deposit", paidKobo: 30_000_00, amountKobo: 10_000_00 })).toMatch(/already been paid/);
  });
  it("installments need the deposit first and a sensible minimum size", () => {
    expect(paymentRuleProblem({ ...base, kind: "installment", amountKobo: 10_000_00 })).toMatch(/deposit/);
    const afterDeposit = { ...base, paidKobo: 30_000_00 }; // 70,000 left over 10 months => at least 7,000
    expect(paymentRuleProblem({ ...afterDeposit, kind: "installment", amountKobo: 6_999_00 })).toMatch(/minimum/);
    expect(paymentRuleProblem({ ...afterDeposit, kind: "installment", amountKobo: 7_000_00 })).toBeNull();
    expect(paymentRuleProblem({ ...afterDeposit, paidKobo: 95_000_00, kind: "installment", amountKobo: 5_000_00 })).toBeNull(); // final small remainder is fine
  });
  it("without a payment plan only a full payment is allowed", () => {
    expect(paymentRuleProblem({ ...base, planAvailable: false, kind: "deposit", amountKobo: 50_000_00 })).toMatch(/no payment plan/);
    expect(paymentRuleProblem({ ...base, planAvailable: false, kind: "full", amountKobo: 100_000_00 })).toBeNull();
  });
});

// ---------------------------------------------------------------- signature helper
describe("webhook signature check", () => {
  it("accepts only the exact HMAC-SHA512 of the raw body", () => {
    process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET;
    const raw = '{"event":"charge.success"}';
    expect(verifyWebhookSignature(raw, paystackSig(raw))).toBe(true);
    expect(verifyWebhookSignature(raw + " ", paystackSig(raw))).toBe(false);
    expect(verifyWebhookSignature(raw, paystackSig(raw, "other-secret"))).toBe(false);
    expect(verifyWebhookSignature(raw, null)).toBe(false);
    expect(verifyWebhookSignature(raw, "short")).toBe(false);
  });
});

// ---------------------------------------------------------------- live webhook (needs the dev server to know the test secret)
async function webhookIsLive() {
  const r = await postWebhook(BASE, { event: "ping" }).catch(() => null);
  return r?.status === 200;
}
const live = await webhookIsLive();
if (!live) console.warn(`\n[SKIPPED] live webhook tests: the running server does not know PAYSTACK_SECRET_KEY=${WEBHOOK_SECRET}. Restart the dev server so it reads .env.local.\n`);

describe.skipIf(!live)("POST /api/webhooks/paystack (live)", () => {
  const charge = (reference: string, amount: number) => ({ event: "charge.success", data: { reference, amount, status: "success", channel: "card" } });

  it("rejects a bad or missing signature", async () => {
    expect((await postWebhook(BASE, charge("PAY-X", 1), "deadbeef")).status).toBe(401);
    const res = await fetch(`${BASE}/api/webhooks/paystack`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("settles a payment: receipt, stage change, notification; repeats change nothing", async () => {
    const d = await makeDeal({ price: 100_000_00, pay: 30_000_00, kind: "deposit" });
    const first = await postWebhook(BASE, charge(d.payment.reference, 30_000_00));
    expect(first.status).toBe(200); expect(first.json.alreadyProcessed).toBe(false);
    const second = await postWebhook(BASE, charge(d.payment.reference, 30_000_00));
    expect(second.status).toBe(200); expect(second.json.alreadyProcessed).toBe(true);

    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, d.payment.id));
    expect(pay.status).toBe("success"); expect(pay.paidAt).not.toBeNull(); expect(pay.method).toBe("card");
    expect(await db.select().from(schema.receipts).where(eq(schema.receipts.paymentId, pay.id))).toHaveLength(1);
    const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, d.tx.id));
    expect(tx.stage).toBe("payment_received");
    expect(await db.select().from(schema.transactionEvents).where(eq(schema.transactionEvents.transactionId, d.tx.id))).toHaveLength(1);
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.customerId, d.customer.id));
    expect(notes.filter((n) => n.type === "payment_confirmed")).toHaveLength(1); // sent once, not per webhook
  });

  it("paying the full price marks the property sold and moves to documentation", async () => {
    const d = await makeDeal({ price: 50_000_00, pay: 50_000_00, kind: "full" });
    await postWebhook(BASE, charge(d.payment.reference, 50_000_00));
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, d.property.id)))[0].status).toBe("sold");
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, d.tx.id)))[0].stage).toBe("documentation_processing");
  });

  it("an amount that differs from what we asked for is flagged, never accepted", async () => {
    const d = await makeDeal({ price: 100_000_00, pay: 30_000_00 });
    const r = await postWebhook(BASE, charge(d.payment.reference, 1_00));
    expect(r.status).toBe(200); expect(r.json.flagged).toBe(true);
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, d.payment.id));
    expect(pay.status).toBe("failed");
    expect(await db.select().from(schema.receipts).where(eq(schema.receipts.paymentId, pay.id))).toHaveLength(0);
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, d.tx.id)))[0].stage).toBe("property_selected");
  });

  it("unknown references and other events are acknowledged without crashing", async () => {
    expect((await postWebhook(BASE, charge("PAY-DOES-NOT-EXIST", 100))).status).toBe(200);
    expect((await postWebhook(BASE, { event: "transfer.success", data: {} })).status).toBe(200);
    expect((await postWebhook(BASE, { event: "charge.success" })).status).toBe(200);
  });

  it("a paid reservation activates the reservation and reserves the property", async () => {
    const d = await makeDeal({ price: 100_000_00, pay: 2_000_00, kind: "reservation" });
    await db.insert(schema.reservations).values({ propertyId: d.property.id, customerId: d.customer.id, amountKobo: 2_000_00, expiresAt: new Date(Date.now() + 1e6) });
    await postWebhook(BASE, charge(d.payment.reference, 2_000_00));
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, d.property.id)))[0].status).toBe("reserved");
    expect((await db.select().from(schema.reservations).where(eq(schema.reservations.customerId, d.customer.id)))[0].status).toBe("active");
    expect((await db.select().from(schema.transactions).where(eq(schema.transactions.id, d.tx.id)))[0].stage).toBe("reservation_confirmed");
  });
});

// ---------------------------------------------------------------- Paystack calls with a MOCKED network (real Paystack cannot be reached offline)
describe("Paystack requests (mocked network)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });
  const mock = (handler: (url: string, init: RequestInit) => unknown) => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(handler(String(url), init)), { status: 200 }); }) as typeof fetch;
    return calls;
  };
  const ok = { status: true, data: { authorization_url: "https://checkout.paystack.test/abc", access_code: "ac", reference: "r" } };

  it("initialize sends amount in kobo, the secret as a Bearer token and the reference", async () => {
    process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET;
    const calls = mock(() => ok);
    const r = await initializePayment({ email: "a@b.com", amountKobo: 12345, reference: "PAY-1", metadata: { x: 1 } });
    expect(r.authorizationUrl).toBe("https://checkout.paystack.test/abc");
    expect(calls[0].url).toBe("https://api.paystack.co/transaction/initialize");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${WEBHOOK_SECRET}`);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ email: "a@b.com", amount: 12345, reference: "PAY-1" });
  });

  it("a reservation with a fee creates a pending payment from the PROPERTY's fee and returns the checkout link", async () => {
    process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET;
    const calls = mock(() => ok);
    const c = await makeCustomer(); const p = await makeProperty({ reservationFeeKobo: 5_000_00 });
    const r = await createReservation(c, p.slug, true);
    expect(r.authorizationUrl).toBe("https://checkout.paystack.test/abc");
    expect(JSON.parse(String(calls[0].init.body)).amount).toBe(5_000_00);
    expect(r.reservation.status).toBe("pending");
    expect((await db.select().from(schema.properties).where(eq(schema.properties.id, p.id)))[0].status).toBe("available"); // not reserved until paid
    // someone else cannot grab it while the first buyer is mid-payment
    const other = await makeCustomer();
    await expect(createReservation(other, p.slug, true)).rejects.toMatchObject({ status: 409 });
  });

  it("if the gateway is down the reservation is released instead of stuck", async () => {
    process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET;
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
    const c = await makeCustomer(); const p = await makeProperty({ reservationFeeKobo: 5_000_00 });
    await expect(createReservation(c, p.slug, true)).rejects.toMatchObject({ status: 502 });
    expect((await db.select().from(schema.reservations).where(eq(schema.reservations.customerId, c.id)))[0].status).toBe("cancelled");
    mock(() => ok); // gateway is back
    expect(await createReservation(await makeCustomer(), p.slug, true)).toBeTruthy(); // the property was freed, so another buyer can reserve
  });

  it("startPayment uses the server's records and starts a payment within the rules", async () => {
    process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET;
    const calls = mock(() => ok);
    const d = await makeDeal({ price: 100_000_00, pay: 1_00 });
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.transactionId, d.tx.id)); // nothing in flight
    await db.update(schema.properties).set({ paymentPlanAvailable: true, minDepositPercent: 30 }).where(eq(schema.properties.id, d.property.id));
    await expect(startPayment(d.customer, { transactionId: d.tx.id, kind: "deposit", amountKobo: 10_000_00, acceptTerms: true })).rejects.toMatchObject({ status: 400 });
    const r = await startPayment(d.customer, { transactionId: d.tx.id, kind: "deposit", amountKobo: 30_000_00, acceptTerms: true });
    expect(r.authorizationUrl).toBe("https://checkout.paystack.test/abc");
    expect(JSON.parse(String(calls[0].init.body)).amount).toBe(30_000_00);
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.reference, r.reference));
    expect(rows[0]).toMatchObject({ status: "pending", kind: "deposit", customerId: d.customer.id });
  });

  it("verify settles only when Paystack confirms success AND the amount matches; repeat calls are harmless", async () => {
    process.env.PAYSTACK_SECRET_KEY = WEBHOOK_SECRET;
    const d = await makeDeal({ price: 100_000_00, pay: 30_000_00 });
    mock(() => ({ status: true, data: { status: "abandoned", amount: 30_000_00 } }));
    expect((await verifyReference(d.customer.id, d.payment.reference)).status).toBe("pending");
    mock(() => ({ status: true, data: { status: "success", amount: 30_000_00, channel: "bank_transfer" } }));
    expect((await verifyReference(d.customer.id, d.payment.reference)).status).toBe("success");
    expect((await verifyReference(d.customer.id, d.payment.reference)).status).toBe("success");
    expect(await db.select().from(schema.receipts).where(eq(schema.receipts.paymentId, d.payment.id))).toHaveLength(1);
    const d2 = await makeDeal({ price: 100_000_00, pay: 30_000_00 });
    mock(() => ({ status: true, data: { status: "success", amount: 1, channel: "card" } }));
    await expect(verifyReference(d2.customer.id, d2.payment.reference)).rejects.toMatchObject({ status: 409 });
    await expect(verifyReference(d.customer.id, d2.payment.reference)).rejects.toMatchObject({ status: 404 }); // not their payment
  });
});
