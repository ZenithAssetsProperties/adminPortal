import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TITLE_DOC_KINDS, currentVersionOnly } from "@/lib/documents";
import { adminRoute } from "@/lib/http";

export const GET = adminRoute("properties.read", async () => {
  const [props, agents, docs] = await Promise.all([
    db
      .select({
        id: schema.properties.id,
        name: schema.properties.name,
        slug: schema.properties.slug,
        city: schema.properties.city,
        state: schema.properties.state,
        type: schema.properties.type,
        priceKobo: schema.properties.priceKobo,
        status: schema.properties.status,
        verified: schema.properties.verified,
        verificationStatus: schema.properties.verificationStatus,
        verificationHash: schema.properties.verificationHash,
        verifiedAt: schema.properties.verifiedAt,
        rejectionReason: schema.properties.rejectionReason,
        agentId: schema.properties.agentId,
        agentName: schema.staff.name,
        createdAt: schema.properties.createdAt,
      })
      .from(schema.properties)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.properties.agentId))
      .where(isNull(schema.properties.deletedAt))
      .orderBy(desc(schema.properties.createdAt))
      .limit(100),
    db
      .select({ id: schema.staff.id, name: schema.staff.name, email: schema.staff.email })
      .from(schema.staff)
      .where(and(eq(schema.staff.role, "sales_agent"), eq(schema.staff.active, true)))
      .orderBy(asc(schema.staff.name)),
    db
      .select({
        id: schema.documents.id,
        propertyId: schema.documents.propertyId,
        kind: schema.documents.kind,
        title: schema.documents.title,
        status: schema.documents.status,
        sha256Hash: schema.documents.sha256Hash,
        fraudFlag: schema.documents.fraudFlag,
        isSealed: sql<boolean>`${schema.documents.integritySeal} is not null`,
        lastVerifiedAt: schema.documents.lastVerifiedAt,
      })
      .from(schema.documents)
      .where(and(currentVersionOnly, inArray(schema.documents.kind, [...TITLE_DOC_KINDS]))),
  ]);

  const docsByProp = new Map<string, typeof docs>();
  for (const d of docs) {
    if (!d.propertyId) continue;
    const arr = docsByProp.get(d.propertyId) ?? [];
    arr.push(d);
    docsByProp.set(d.propertyId, arr);
  }

  const items = props.map((p) => {
    const titleDocs = docsByProp.get(p.id) ?? [];
    const approvedSealed = titleDocs.filter((d) => d.status === "approved" && d.isSealed && !d.fraudFlag);
    return {
      ...p,
      titleDocs,
      hasAgent: Boolean(p.agentId),
      hasApprovedTitleDoc: approvedSealed.length > 0,
      fraudAlertCount: titleDocs.filter((d) => Boolean(d.fraudFlag)).length,
    };
  });

  return { items, agents };
});
