import { createHmac } from "node:crypto";
import { like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword } from "@/lib/auth/password";
import { makeCustomer, makeProperty, uniq } from "./helpers";

export const WEBHOOK_SECRET = "sk_test_local_webhook_secret";
export { uniq };

/** Clear the per-IP/email counters these tests use, so repeated runs are not throttled by earlier runs. */
export async function resetRateLimits() {
  await db.delete(schema.rateLimits).where(or(
    like(schema.rateLimits.key, "clogin:%"), like(schema.rateLimits.key, "creg:%"), like(schema.rateLimits.key, "pub:%"),
    like(schema.rateLimits.key, "enq:%"), like(schema.rateLimits.key, "insp:%"), like(schema.rateLimits.key, "analytics:%"),
    like(schema.rateLimits.key, "cfp:%"), like(schema.rateLimits.key, "cpw:%"), like(schema.rateLimits.key, "cvp%"),
  ));
}

export async function customerWithPassword(password: string) {
  const c = await makeCustomer({ passwordHash: await hashPassword(password) });
  return c;
}

/** A customer, a property and a transaction with one pending payment. */
export async function makeDeal(over: { price?: number; pay?: number; kind?: "reservation" | "deposit" | "installment" | "balance" | "full" } = {}) {
  const customer = await makeCustomer();
  const property = await makeProperty({ priceKobo: over.price ?? 10_000_000_00 });
  const [tx] = await db.insert(schema.transactions).values({
    reference: `TXN-T${uniq()}`, customerId: customer.id, propertyId: property.id, priceKobo: property.priceKobo,
  }).returning();
  const [payment] = await db.insert(schema.payments).values({
    reference: `PAY-T${uniq()}`, transactionId: tx.id, customerId: customer.id, kind: over.kind ?? "deposit", amountKobo: over.pay ?? 3_000_000_00,
  }).returning();
  return { customer, property, tx, payment };
}

export async function makeDoc(over: Partial<typeof schema.documents.$inferInsert> = {}) {
  const [d] = await db.insert(schema.documents).values({
    groupId: crypto.randomUUID(), title: `Doc ${uniq()}`, storageKey: `documents/test/${uniq()}.pdf`, mimeType: "application/pdf", sizeBytes: 100,
    status: "approved", ...over,
  }).returning();
  return d;
}

export function paystackSig(raw: string, secret = WEBHOOK_SECRET) {
  return createHmac("sha512", secret).update(raw).digest("hex");
}

export async function postWebhook(base: string, event: object, sig?: string) {
  const raw = JSON.stringify(event);
  const res = await fetch(`${base}/api/webhooks/paystack`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": sig ?? paystackSig(raw) }, body: raw });
  return { status: res.status, json: await res.json().catch(() => null) };
}
