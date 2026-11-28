import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TITLE_DOC_KINDS, currentVersionOnly } from "@/lib/documents";
import { notFound, preflight, publicRoute } from "@/lib/http";
import { DOC_LABELS, publicVisible } from "@/lib/public-dto";

export const OPTIONS = preflight;

/**
 * Public Trust Certificate for a verified property listing.
 * Exposes verification hash, sealed document types & issuing authorities without leaking private files.
 */
export const GET = publicRoute(
  async ({ params }) => {
    const [prop] = await db
      .select({
        id: schema.properties.id,
        slug: schema.properties.slug,
        name: schema.properties.name,
        verified: schema.properties.verified,
        verificationStatus: schema.properties.verificationStatus,
        verificationHash: schema.properties.verificationHash,
        verifiedAt: schema.properties.verifiedAt,
        agentName: schema.staff.name,
      })
      .from(schema.properties)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.properties.agentId))
      .where(and(eq(schema.properties.slug, params.slug), publicVisible))
      .limit(1);

    if (!prop) throw notFound("Verified property not found");

    const sealedDocs = await db
      .select({
        kind: schema.documents.kind,
        issuingAuthority: schema.documents.issuingAuthority,
        approvedAt: schema.documents.approvedAt,
        isSealed: sql<boolean>`${schema.documents.integritySeal} is not null`,
      })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.propertyId, prop.id),
          eq(schema.documents.status, "approved"),
          inArray(schema.documents.kind, [...TITLE_DOC_KINDS]),
          currentVersionOnly,
        ),
      );

    return {
      propertyId: prop.id,
      slug: prop.slug,
      name: prop.name,
      verified: prop.verified,
      verificationHash: prop.verificationHash,
      verifiedAt: prop.verifiedAt,
      assignedAgentFirstName: prop.agentName ? prop.agentName.split(" ")[0] : null,
      verifiedDocuments: sealedDocs
        .filter((d) => d.isSealed)
        .map((d) => ({
          kind: d.kind,
          label: DOC_LABELS[d.kind] ?? d.kind,
          issuingAuthority: d.issuingAuthority ?? "Verified Registry",
          sealedAt: d.approvedAt,
        })),
    };
  },
  { limit: 120, name: "v1-property-trust" },
);
