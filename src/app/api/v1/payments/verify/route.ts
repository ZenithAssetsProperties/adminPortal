import { z } from "zod";
import { customerRoute, parseQuery, preflight } from "@/lib/http";
import { verifyReference } from "@/lib/checkout";

export const OPTIONS = preflight;
// The website's payment return page calls this with ?reference=... (the webhook may have settled it already; both are safe).
export const GET = customerRoute(async ({ req, customer }) =>
  verifyReference(customer.id, parseQuery(req, z.object({ reference: z.string().min(5).max(60) })).reference), { name: "pay-verify", limit: 30 });
