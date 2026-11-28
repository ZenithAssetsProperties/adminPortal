import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, conflict, forbidden, getIp, notFound, parseBody } from "@/lib/http";
import { notifyCustomer } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { computeSha256, signDocumentSeal } from "@/lib/crypto-integrity";
import { TITLE_DOC_KINDS } from "@/lib/documents";
import { getPrivacySettings } from "@/lib/privacy";
import { readObject } from "@/lib/storage";

const Checklist = z.object({
  registryVerified: z.boolean(),
  ownerNameMatches: z.boolean(),
  boundariesClear: z.boolean(),
  noEncumbrance: z.boolean(),
});

const Body = z.object({
  decision: z.enum(["approve", "reject"]),
  checklist: Checklist.optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
  reviewNotes: z.string().trim().max(1000).optional(),
});

/**
 * Structured Document Vetting & Cryptographic Sealing:
 * - Enforces Maker-Checker segregation (uploader != reviewer when enabled)
 * - Requires 4-point legal vetting checklist for title document approval
 * - Requires rejectionReason when rejecting
 * - Signs HMAC-SHA256 integritySeal & logs immutable vetting history
 */
export const POST = adminRoute("documents.approve", async ({ req, staff, params }) => {
  const body = await parseBody(req, Body);
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, params.id));
  if (!doc) throw notFound();

  const [latest] = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.groupId, doc.groupId)).orderBy(desc(schema.documents.version)).limit(1);
  if (latest.id !== doc.id) throw conflict("This is an older version. Review the current version instead.");

  const settings = await getPrivacySettings();
  if (settings.enforceMakerChecker && doc.uploadedBy && doc.uploadedBy === staff.id && staff.role !== "super_admin") {
    throw forbidden("Maker-Checker Policy: you cannot approve or reject a document you uploaded.");
  }

  const now = new Date();
  const status = body.decision === "approve" ? "approved" : "rejected";
  const isTitleDoc = (TITLE_DOC_KINDS as readonly string[]).includes(doc.kind);

  if (status === "approved" && isTitleDoc) {
    const c = body.checklist;
    if (!c || !c.registryVerified || !c.ownerNameMatches || !c.boundariesClear || !c.noEncumbrance) {
      throw badRequest("All 4 legal vetting checks must pass before sealing a title document.");
    }
  }

  if (status === "rejected" && (!body.rejectionReason || body.rejectionReason.trim().length < 10)) {
    throw badRequest("Provide a clear rejection reason (at least 10 characters) for the uploader.");
  }

  let sha256Hash = doc.sha256Hash;
  let integritySeal: string | null = null;

  if (status === "approved") {
    if (!sha256Hash) {
      const buf = await readObject(doc.storageKey).catch(() => null);
      if (buf) sha256Hash = computeSha256(buf);
    }
    if (sha256Hash) {
      integritySeal = signDocumentSeal({
        id: doc.id,
        propertyId: doc.propertyId,
        sha256Hash,
        approvedBy: staff.id,
        approvedAt: now.toISOString(),
      });
    }
  }

  const [row] = await db
    .update(schema.documents)
    .set({
      status,
      approvedBy: staff.id,
      approvedAt: now,
      sha256Hash,
      integritySeal,
      vettingChecklist: body.checklist ?? doc.vettingChecklist,
      rejectionReason: status === "rejected" ? body.rejectionReason! : null,
      reviewNotes: body.reviewNotes ?? doc.reviewNotes,
      lastVerifiedAt: status === "approved" ? now : doc.lastVerifiedAt,
    })
    .where(eq(schema.documents.id, doc.id))
    .returning();

  await db.insert(schema.documentVettingLogs).values({
    documentId: doc.id,
    reviewerId: staff.id,
    stage: status === "approved" ? "final_seal" : "rejected",
    passed: status === "approved",
    notes: status === "approved" ? (body.reviewNotes ?? "Vetting passed and cryptographically sealed.") : body.rejectionReason!,
    checklist: body.checklist ?? null,
  });

  if (status === "approved" && row.customerId) {
    await notifyCustomer(row.customerId, { type: "document_uploaded", title: "New document available", body: `"${row.title}" is now available in your document vault.` });
  }
  await audit({ type: "staff", id: staff.id }, `document.${body.decision}`, {
    entity: "document",
    entityId: row.id,
    meta: { sealed: Boolean(integritySeal), sha256Hash },
    ip: getIp(req),
  });
  const { storageKey: _k, ...safe } = row; void _k;
  return safe;
});
