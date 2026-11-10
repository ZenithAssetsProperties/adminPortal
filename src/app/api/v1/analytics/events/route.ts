import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, getIp, parseBody, preflight, publicRoute, requireApiKey } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const Event = z.object({
  type: z.enum(["visit", "property_view", "search", "tour_view", "doc_view", "enquiry_click", "payment_started", "page_view"]),
  propertySlug: z.string().trim().max(200).optional(),
  sessionId: z.string().trim().max(80).optional(),
  source: z.string().trim().max(80).optional(),
  meta: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});
const Body = z.union([Event, z.object({ events: z.array(Event).min(1).max(20) })]);

function hasValidKey(req: Request) { try { requireApiKey(req); return true; } catch { return false; } }

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const body = await parseBody(req, Body);
  const events = "events" in body ? body.events : [body];
  // the website's server (with the shared key) gets a much higher allowance than anonymous browsers
  const ok = hasValidKey(req) ? await rateLimit("analytics:key", 6000, 60) : await rateLimit(`analytics:${getIp(req) ?? "?"}`, 120, 60);
  if (!ok) throw new ApiError(429, "Too many requests");

  const slugs = [...new Set(events.map((e) => e.propertySlug).filter((s): s is string => Boolean(s)))];
  const ids = new Map<string, string>();
  for (const s of slugs) {
    const [p] = await db.select({ id: schema.properties.id }).from(schema.properties).where(eq(schema.properties.slug, s));
    if (p) ids.set(s, p.id);
  }
  await db.insert(schema.analyticsEvents).values(events.map((e) => ({
    type: e.type, propertyId: e.propertySlug ? ids.get(e.propertySlug) : undefined, sessionId: e.sessionId, source: e.source,
    meta: e.meta && JSON.stringify(e.meta).length <= 1500 ? e.meta : undefined,
  })));
  return { ok: true, accepted: events.length };
}, { name: "analytics" });
