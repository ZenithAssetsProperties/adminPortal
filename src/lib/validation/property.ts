import { z } from "zod";

export const PropertyInput = z.object({
  name: z.string().trim().min(3).max(160),
  type: z.enum(["land", "house", "apartment", "commercial"]),
  purpose: z.enum(["buy", "invest", "rent"]).default("buy"),
  status: z.enum(["draft", "available", "reserved", "sold"]).default("draft"),
  state: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  area: z.string().trim().max(120).nullish(),
  latitude: z.string().trim().max(30).nullish(),
  longitude: z.string().trim().max(30).nullish(),
  priceKobo: z.number().int().positive().max(10_000_000_000_000_00),
  sizeSqm: z.number().int().positive().nullish(),
  landSizeSqm: z.number().int().positive().nullish(),
  bedrooms: z.number().int().min(0).max(100).nullish(),
  bathrooms: z.number().int().min(0).max(100).nullish(),
  parking: z.number().int().min(0).max(100).nullish(),
  developmentStatus: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(10_000).nullish(),
  features: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  nearby: z.array(z.object({ category: z.string().max(60), name: z.string().max(120), distance: z.string().max(40).optional() })).max(50).default([]),
  investment: z.object({
    rentalPotential: z.string().max(1000).optional(), appreciation: z.string().max(1000).optional(),
    developmentPlans: z.string().max(1000).optional(), estimatedCosts: z.string().max(1000).optional(),
    risks: z.string().max(1000).optional(), horizon: z.string().max(200).optional(),
  }).nullish(),
  verified: z.boolean().default(false),
  verificationNotes: z.string().trim().max(2000).nullish(),
  paymentPlanAvailable: z.boolean().default(false),
  minDepositPercent: z.number().int().min(0).max(100).default(30),
  maxPlanMonths: z.number().int().min(1).max(120).default(12),
  reservationFeeKobo: z.number().int().min(0).default(0),
  reservationDays: z.number().int().min(1).max(90).default(7),
  featured: z.boolean().default(false),
  priceReduced: z.boolean().default(false),
  limitedAvailability: z.boolean().default(false),
  agentId: z.string().uuid().nullish(),
});
export type PropertyInputT = z.infer<typeof PropertyInput>;
export const PropertyPatch = PropertyInput.partial();

export function slugify(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "property";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
