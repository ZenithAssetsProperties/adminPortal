import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { computePropertyVerificationHash } from "@/lib/crypto-integrity";
import { TITLE_DOC_KINDS, currentVersionOnly } from "@/lib/documents";
import { adminRoute, badRequest, conflict, getIp, notFound, parseBody } from "@/lib/http";
import { notifyStaff } from "@/lib/notify";
import { getPublishReadiness } from "@/lib/property-guard";

export const GET = adminRoute("properties.read", async ({ params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  return getPublishReadiness(params.id);
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit_review"), notes: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("assign_agent"), agentId: z.string().uuid(), notes: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("verify"), publishNow: z.boolean().optional(), notes: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(5).max(1000) }),
]);

export const POST = adminRoute("properties.write", async ({ req, staff, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const body = await parseBody(req, Action);

  const [prop] = await db
    .select()
    .from(schema.properties)
    .where(and(eq(schema.properties.id, params.id), isNull(schema.properties.deletedAt)))
    .limit(1);

  if (!prop) throw notFound("Property not found");
  const now = new Date();
  const ip = getIp(req);

  if (body.action === "submit_review") {
    const [updated] = await db
      .update(schema.properties)
      .set({
        verificationStatus: "pending_review",
        rejectionReason: null,
        verificationNotes: body.notes ?? prop.verificationNotes,
        updatedAt: now,
      })
      .where(eq(schema.properties.id, prop.id))
      .returning();

    await audit({ type: "staff", id: staff.id }, "property.verification.submit", {
      entity: "property",
      entityId: prop.id,
      ip,
    });
    return updated;
  }

  if (body.action === "assign_agent") {
    const [agent] = await db
      .select({ id: schema.staff.id, name: schema.staff.name, active: schema.staff.active, role: schema.staff.role })
      .from(schema.staff)
      .where(and(eq(schema.staff.id, body.agentId), eq(schema.staff.role, "sales_agent")))
      .limit(1);

    if (!agent) throw notFound("Sales agent not found");
    if (!agent.active) throw badRequest("Selected agent is deactivated");

    const nextVStatus = prop.verificationStatus === "verified" ? "verified" : "agent_assigned";
    const [updated] = await db
      .update(schema.properties)
      .set({
        agentId: agent.id,
        verificationStatus: nextVStatus,
        verificationNotes: body.notes ?? prop.verificationNotes,
        updatedAt: now,
      })
      .where(eq(schema.properties.id, prop.id))
      .returning();

    await notifyStaff(agent.id, {
      type: "verification_assigned",
      title: "Property assigned for verification",
      body: `"${prop.name}" (${prop.city}) has been assigned to you for due diligence & inspection.`,
    });

    await audit({ type: "staff", id: staff.id }, "property.verification.assign_agent", {
      entity: "property",
      entityId: prop.id,
      meta: { agentId: agent.id, agentName: agent.name },
      ip,
    });
    return updated;
  }

  if (body.action === "verify") {
    if (!prop.agentId) {
      throw conflict("Assign a verification/sales agent before marking this property verified.");
    }

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
          eq(schema.documents.propertyId, prop.id),
          inArray(schema.documents.kind, [...TITLE_DOC_KINDS]),
          currentVersionOnly,
        ),
      );

    const sealedTitleDocs = titleDocs.filter(
      (d) => d.status === "approved" && !d.fraudFlag && d.sha256Hash && d.integritySeal,
    );

    if (sealedTitleDocs.length === 0) {
      throw conflict(
        "Cannot verify property: at least one approved and cryptographically sealed title document (C of O, Governor's Consent, Deed, or Survey Plan) is required.",
      );
    }

    const verificationHash = computePropertyVerificationHash(
      prop.id,
      sealedTitleDocs.map((d) => d.sha256Hash!),
      staff.id,
      now.toISOString(),
    );

    const [updated] = await db
      .update(schema.properties)
      .set({
        verified: true,
        verificationStatus: "verified",
        verificationHash,
        verifiedBy: staff.id,
        verifiedAt: now,
        rejectionReason: null,
        verificationNotes: body.notes ?? prop.verificationNotes,
        status: body.publishNow ? "available" : prop.status,
        updatedAt: now,
      })
      .where(eq(schema.properties.id, prop.id))
      .returning();

    await audit({ type: "staff", id: staff.id }, "property.verification.verified", {
      entity: "property",
      entityId: prop.id,
      meta: { verificationHash, published: Boolean(body.publishNow), sealedDocs: sealedTitleDocs.length },
      ip,
    });
    return updated;
  }

  // reject
  const [updated] = await db
    .update(schema.properties)
    .set({
      verified: false,
      verificationStatus: "rejected",
      verificationHash: null,
      rejectionReason: body.reason,
      status: "draft",
      updatedAt: now,
    })
    .where(eq(schema.properties.id, prop.id))
    .returning();

  await audit({ type: "staff", id: staff.id }, "property.verification.rejected", {
    entity: "property",
    entityId: prop.id,
    meta: { reason: body.reason },
    ip,
  });
  return updated;
});
