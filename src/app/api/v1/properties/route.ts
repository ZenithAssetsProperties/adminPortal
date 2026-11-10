import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { parseQuery, preflight, publicRoute } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { cardDto, publicVisible, viewCount } from "@/lib/public-dto";

const Bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const Int = z.coerce.number().int().min(0);

const Q = PageQuery.extend({
  state: z.string().trim().max(80).optional(), city: z.string().trim().max(80).optional(), area: z.string().trim().max(120).optional(),
  type: z.enum(["land", "house", "apartment", "commercial"]).optional(),
  purpose: z.enum(["buy", "invest", "rent"]).optional(),
  minPrice: Int.optional(), maxPrice: Int.optional(), // kobo
  minLand: Int.optional(), maxLand: Int.optional(), minSize: Int.optional(), maxSize: Int.optional(), // sqm
  bedrooms: Int.optional(), bathrooms: Int.optional(), // minimums
  availability: z.enum(["available", "reserved", "sold"]).optional(),
  paymentPlan: Bool.optional(),
  collection: z.enum(["new", "featured", "price_reduced", "popular", "limited"]).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).optional(),
});

export const OPTIONS = preflight;
export const GET = publicRoute(async ({ req }) => {
  const q = parseQuery(req, Q);
  const c: (SQL | undefined)[] = [publicVisible];
  const P = schema.properties;
  if (q.state) c.push(ilike(P.state, likeEscape(q.state)));
  if (q.city) c.push(ilike(P.city, likeEscape(q.city)));
  if (q.area) c.push(ilike(P.area, likeEscape(q.area)));
  if (q.type) c.push(eq(P.type, q.type));
  if (q.purpose) c.push(eq(P.purpose, q.purpose));
  if (q.minPrice != null) c.push(gte(P.priceKobo, q.minPrice));
  if (q.maxPrice != null) c.push(lte(P.priceKobo, q.maxPrice));
  if (q.minLand != null) c.push(gte(P.landSizeSqm, q.minLand));
  if (q.maxLand != null) c.push(lte(P.landSizeSqm, q.maxLand));
  if (q.minSize != null) c.push(gte(P.sizeSqm, q.minSize));
  if (q.maxSize != null) c.push(lte(P.sizeSqm, q.maxSize));
  if (q.bedrooms != null) c.push(gte(P.bedrooms, q.bedrooms));
  if (q.bathrooms != null) c.push(gte(P.bathrooms, q.bathrooms));
  if (q.availability) c.push(eq(P.status, q.availability));
  if (q.paymentPlan != null) c.push(eq(P.paymentPlanAvailable, q.paymentPlan));
  if (q.q) { const l = likeEscape(q.q); c.push(or(ilike(P.name, l), ilike(P.city, l), ilike(P.area, l), ilike(P.description, l))); }
  if (q.collection === "new") c.push(gte(P.createdAt, new Date(Date.now() - 30 * 86_400_000)));
  if (q.collection === "featured") c.push(eq(P.featured, true));
  if (q.collection === "price_reduced") c.push(eq(P.priceReduced, true));
  if (q.collection === "limited") c.push(eq(P.limitedAvailability, true));

  const sort = q.sort ?? (q.collection === "popular" ? "popular" : "newest");
  const order = sort === "price_asc" ? asc(P.priceKobo) : sort === "price_desc" ? desc(P.priceKobo) : sort === "popular" ? desc(viewCount) : desc(P.createdAt);
  const where = and(...c);
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(P).where(where).orderBy(order, desc(P.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(P).where(where),
  ]);
  const origin = new URL(req.url).origin;
  return paged(await Promise.all(rows.map((r) => cardDto(r, origin))), n, q);
}, { name: "properties", limit: 120 });
