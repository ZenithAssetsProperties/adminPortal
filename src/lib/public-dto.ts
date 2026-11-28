import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { notFound } from "@/lib/http";
import { signedUrl } from "@/lib/storage";

export type PropertyRow = typeof schema.properties.$inferSelect;
export const originOf = (req: Request) => new URL(req.url).origin;

/** Drafts, removed, and unverified properties never appear publicly to end users. */
export const publicVisible = and(
  isNull(schema.properties.deletedAt),
  ne(schema.properties.status, "draft"),
  eq(schema.properties.verified, true),
);

export function uuidOr404(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw notFound();
  return id;
}

/**
 * Public card. Deliberately an allow-list: latitude/longitude, agent id, createdBy and
 * verification notes are NOT here, so a new column can never leak by accident.
 */
export async function cardDto(p: PropertyRow, origin: string) {
  return {
    id: p.id, slug: p.slug, name: p.name, type: p.type, purpose: p.purpose, status: p.status,
    state: p.state, city: p.city, area: p.area, priceKobo: p.priceKobo,
    sizeSqm: p.sizeSqm, landSizeSqm: p.landSizeSqm, bedrooms: p.bedrooms, bathrooms: p.bathrooms, parking: p.parking,
    developmentStatus: p.developmentStatus, verified: p.verified, verificationHash: p.verificationHash, verifiedAt: p.verifiedAt,
    featured: p.featured, priceReduced: p.priceReduced,
    limitedAvailability: p.limitedAvailability, paymentPlanAvailable: p.paymentPlanAvailable, createdAt: p.createdAt,
    coverUrl: p.coverImage ? await signedUrl(p.coverImage, origin, undefined, 3600) : null,
  };
}

export const DOC_LABELS: Record<string, string> = {
  survey_plan: "Survey Plan", deed_of_assignment: "Deed of Assignment", certificate_of_occupancy: "Certificate of Occupancy",
  governors_consent: "Governor's Consent", allocation_letter: "Allocation Letter", building_approval: "Building Approval",
  approved_building_plan: "Approved Building Plan", title_document: "Title Document", development_approval: "Development Approval",
  receipt: "Receipt", purchase_agreement: "Purchase Agreement", correspondence: "Correspondence", other: "Other document",
};

export const TIMELINE: [string, string][] = [
  ["property_selected", "Property selected"], ["inspection_completed", "Inspection completed"],
  ["reservation_confirmed", "Reservation confirmed"], ["payment_received", "Payment received"],
  ["documentation_processing", "Documentation processing"], ["ownership_completed", "Ownership documentation completed"],
];

/** Six-step progress view from PRD section 27: done / current / pending. */
export function buildTimeline(stage: string, events: { stage: string; createdAt: Date; note: string | null }[]) {
  const idx = TIMELINE.findIndex(([s]) => s === stage);
  return TIMELINE.map(([s, label], i) => ({
    stage: s, label,
    state: stage === "cancelled" ? "cancelled" : idx === TIMELINE.length - 1 || i < idx ? "done" : i === idx ? "current" : "pending",
    reachedAt: events.find((e) => e.stage === s)?.createdAt ?? null,
  }));
}

/** SQL fragment: how many times a property was viewed in the last 30 days. */
export const viewCount = sql<number>`(select count(*) from analytics_events e where e.property_id = ${schema.properties.id} and e.type = 'property_view' and e.created_at > now() - interval '30 days')`;

export async function outstandingFor(tx: { id: string; priceKobo: number }) {
  const [r] = await db.select({ total: sql<number>`coalesce(sum(${schema.payments.amountKobo}), 0)::bigint` })
    .from(schema.payments).where(and(eq(schema.payments.transactionId, tx.id), eq(schema.payments.status, "success")));
  const paid = Number(r.total);
  return { paidKobo: paid, outstandingKobo: Math.max(0, tx.priceKobo - paid) };
}
