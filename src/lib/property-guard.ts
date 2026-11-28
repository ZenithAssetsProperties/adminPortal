import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { conflict, notFound } from "@/lib/http";
import { TITLE_DOC_KINDS, currentVersionOnly } from "@/lib/documents";

/**
 * Re-opening a reserved or sold property while a buyer holds it (or has paid) would let it be sold twice.
 * To put it back on the market, cancel the reservation or transaction first.
 */
export async function assertCanReopen(propertyId: string, nextStatus: string) {
  if (nextStatus !== "available" && nextStatus !== "draft") return;
  const [hold] = await db.select({ id: schema.reservations.id }).from(schema.reservations)
    .where(and(eq(schema.reservations.propertyId, propertyId), eq(schema.reservations.status, "active"))).limit(1);
  const [paid] = await db.select({ id: schema.payments.id }).from(schema.payments)
    .innerJoin(schema.transactions, eq(schema.payments.transactionId, schema.transactions.id))
    .where(and(eq(schema.transactions.propertyId, propertyId), eq(schema.payments.status, "success"), sql`${schema.transactions.stage} <> 'cancelled'`)).limit(1);
  if (hold || paid) throw conflict("A buyer holds or has paid for this property. Cancel the reservation or transaction first.");
}

export type PublishReadiness = {
  ready: boolean;
  hasAssignedAgent: boolean;
  hasApprovedTitleDoc: boolean;
  hasCryptographicSeal: boolean;
  isVerified: boolean;
  missing: string[];
};

export async function getPublishReadiness(propertyId: string): Promise<PublishReadiness> {
  const [prop] = await db
    .select({
      id: schema.properties.id,
      agentId: schema.properties.agentId,
      verified: schema.properties.verified,
      verificationStatus: schema.properties.verificationStatus,
    })
    .from(schema.properties)
    .where(and(eq(schema.properties.id, propertyId), isNull(schema.properties.deletedAt)))
    .limit(1);

  if (!prop) throw notFound("Property not found");

  const titleDocs = await db
    .select({
      id: schema.documents.id,
      status: schema.documents.status,
      sha256Hash: schema.documents.sha256Hash,
      integritySeal: schema.documents.integritySeal,
      fraudFlag: schema.documents.fraudFlag,
    })
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.propertyId, propertyId),
        inArray(schema.documents.kind, [...TITLE_DOC_KINDS]),
        currentVersionOnly,
      ),
    );

  const approvedTitleDocs = titleDocs.filter((d) => d.status === "approved" && !d.fraudFlag);
  const sealedDocs = approvedTitleDocs.filter((d) => Boolean(d.sha256Hash && d.integritySeal));

  const hasAssignedAgent = Boolean(prop.agentId);
  const hasApprovedTitleDoc = approvedTitleDocs.length > 0;
  const hasCryptographicSeal = sealedDocs.length > 0;
  const isVerified = prop.verified && prop.verificationStatus === "verified";

  const missing: string[] = [];
  if (!hasAssignedAgent) missing.push("Assign a verification/sales agent");
  if (!hasApprovedTitleDoc) missing.push("Upload & approve at least one title document (C of O, Governor's Consent, Deed, or Survey Plan)");
  if (hasApprovedTitleDoc && !hasCryptographicSeal) missing.push("Title document must have a valid cryptographic integrity seal");
  if (!isVerified) missing.push("Complete company admin verification review");

  return {
    ready: missing.length === 0,
    hasAssignedAgent,
    hasApprovedTitleDoc,
    hasCryptographicSeal,
    isVerified,
    missing,
  };
}

/**
 * Blocks publishing a property to `available` unless it passes the full verification checklist.
 */
export async function assertCanPublish(propertyId: string) {
  const readiness = await getPublishReadiness(propertyId);
  if (!readiness.ready) {
    throw conflict(`Cannot publish property until verification requirements are met: ${readiness.missing.join("; ")}`);
  }
}
