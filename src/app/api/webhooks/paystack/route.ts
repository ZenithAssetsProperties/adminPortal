import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/http";
import { verifyWebhookSignature } from "@/lib/paystack";
import { settlePayment } from "@/lib/payments";
import { audit } from "@/lib/audit";

/**
 * Paystack calls this when a payment succeeds. We verify the HMAC-SHA512 signature over the RAW body first.
 * Always answer 200 for events we understand (even repeats), so Paystack stops retrying.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string; amount?: number; channel?: string; status?: string } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }

  if (event.event !== "charge.success" || !event.data?.reference || typeof event.data.amount !== "number") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    const r = await settlePayment(event.data.reference, event.data.amount, { method: event.data.channel });
    return NextResponse.json({ ok: true, alreadyProcessed: r.already });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return NextResponse.json({ ok: true, ignored: "unknown reference" });
    if (e instanceof ApiError && e.status === 409) {
      // gateway charged a different amount than we expected: needs a human, but retrying will not help
      await audit({ type: "system" }, "payment.amount_mismatch", { entity: "payment", entityId: event.data.reference, meta: { paid: event.data.amount } });
      return NextResponse.json({ ok: true, flagged: true });
    }
    console.error("WEBHOOK SETTLE FAILED", e);
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 }); // Paystack will retry
  }
}
