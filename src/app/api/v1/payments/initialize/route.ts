import { z } from "zod";
import { customerRoute, parseBody, preflight } from "@/lib/http";
import { startPayment } from "@/lib/checkout";

const Body = z.object({
  transactionId: z.string().uuid(),
  kind: z.enum(["deposit", "installment", "balance", "full"]),
  amountKobo: z.number().int().positive(),
  acceptTerms: z.literal(true),
});

export const OPTIONS = preflight;
export const POST = customerRoute(async ({ req, customer }) => startPayment(customer, await parseBody(req, Body)), { name: "pay-init", limit: 20 });
