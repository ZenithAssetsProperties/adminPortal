import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound, preflight, publicRoute } from "@/lib/http";
import { DOC_LABELS, cardDto, originOf, publicVisible } from "@/lib/public-dto";
import { signedUrl } from "@/lib/storage";

export const OPTIONS = preflight;
export const GET = publicRoute(async ({ req, params }) => {
  const P = schema.properties;
  const [p] = await db.select().from(P).where(and(eq(P.slug, params.slug), publicVisible));
  if (!p) throw notFound("Property not found");
  const origin = originOf(req);

  const media = await db.select().from(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, p.id)).orderBy(schema.propertyMedia.sort);
  const mediaOut = await Promise.all(media.map(async (m) => ({
    id: m.id, kind: m.kind, caption: m.caption,
    url: m.storageKey ? await signedUrl(m.storageKey, origin, undefined, 3600) : m.url,
  })));

  // Documentation STATUS only: no links, no storage keys. Latest approved version per document.
  const docs = await db.select().from(schema.documents)
    .where(and(eq(schema.documents.propertyId, p.id), isNull(schema.documents.customerId), eq(schema.documents.status, "approved")))
    .orderBy(desc(schema.documents.version));
  const seen = new Set<string>();
  const documentation = docs.filter((d) => !seen.has(d.groupId) && seen.add(d.groupId)).map((d) => ({
    kind: d.kind, title: d.title, label: DOC_LABELS[d.kind] ?? d.kind,
    status: "Verified / Available for review",
    accessRequired: d.visibility !== "public",
    ...(d.visibility === "public" ? { documentId: d.id } : {}),
  }));

  let agent: { name: string; phone: string | null } | null = null;
  if (p.agentId) {
    const [a] = await db.select({ name: schema.staff.name, phone: schema.staff.phone }).from(schema.staff).where(eq(schema.staff.id, p.agentId));
    agent = a ?? null;
  }
  const similarRows = await db.select().from(P)
    .where(and(publicVisible, ne(P.id, p.id), eq(P.city, p.city), eq(P.status, "available"))).orderBy(desc(P.featured), desc(P.createdAt)).limit(4);

  return {
    ...(await cardDto(p, origin)),
    description: p.description, features: p.features, nearby: p.nearby,
    // exact coordinates are never exposed: only the general area above
    investment: p.purpose === "invest" && p.investment ? { ...p.investment, disclaimer: "All figures are estimates, not guaranteed returns." } : null,
    verification: { verified: p.verified, explanation: p.verified ? (p.verificationNotes ?? "This property passed Zenith Asset Group's internal verification.") : null },
    media: mediaOut, documentation, agent,
    paymentPlan: { available: p.paymentPlanAvailable, minDepositPercent: p.minDepositPercent, maxMonths: p.maxPlanMonths },
    reservation: { feeKobo: p.reservationFeeKobo, holdDays: p.reservationDays },
    similar: await Promise.all(similarRows.map((r) => cardDto(r, origin))),
  };
}, { name: "property", limit: 120 });
