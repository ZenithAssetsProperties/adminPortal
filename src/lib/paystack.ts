import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http";

const BASE = "https://api.paystack.co";
const secret = () => {
  const s = process.env.PAYSTACK_SECRET_KEY;
  if (!s) throw new ApiError(503, "Online payments are not configured yet");
  return s;
};

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const s = process.env.PAYSTACK_SECRET_KEY;
  if (!s || !signature) return false;
  const expected = createHmac("sha512", s).update(rawBody).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function initializePayment(p: {
  email: string; amountKobo: number; reference: string; callbackUrl?: string; metadata?: Record<string, unknown>;
}): Promise<{ authorizationUrl: string; accessCode: string; reference: string }> {
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: p.email, amount: p.amountKobo, reference: p.reference, callback_url: p.callbackUrl, metadata: p.metadata,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) throw new ApiError(502, "Payment provider could not start the payment");
  return { authorizationUrl: json.data.authorization_url, accessCode: json.data.access_code, reference: json.data.reference };
}

export async function verifyPayment(reference: string): Promise<{ success: boolean; amountKobo: number; channel?: string }> {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) throw new ApiError(502, "Payment provider could not verify the payment");
  return { success: json.data.status === "success", amountKobo: json.data.amount, channel: json.data.channel };
}
