import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { badRequest, notFound, parseQuery, preflight, publicRoute } from "@/lib/http";
import { paymentPlan } from "@/lib/money";
import { publicVisible } from "@/lib/public-dto";

const Q = z.object({ deposit: z.coerce.number().min(0).max(100), months: z.coerce.number().int().min(1).max(120) });

export const OPTIONS = preflight;
export const GET = publicRoute(async ({ req, params }) => {
  const { deposit, months } = parseQuery(req, Q);
  const [p] = await db.select().from(schema.properties).where(and(eq(schema.properties.slug, params.slug), publicVisible));
  if (!p) throw notFound("Property not found");
  if (!p.paymentPlanAvailable) throw badRequest("This property does not offer a payment plan");
  if (deposit < p.minDepositPercent) throw badRequest(`The minimum deposit is ${p.minDepositPercent}%`);
  if (months > p.maxPlanMonths) throw badRequest(`The longest plan is ${p.maxPlanMonths} months`);
  return {
    priceKobo: p.priceKobo, depositPercent: deposit, ...paymentPlan(p.priceKobo, deposit, months),
    note: "Estimate. The final schedule is confirmed in your purchase agreement.",
  };
}, { name: "plan", limit: 120 });
