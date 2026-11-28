import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { computeSha256, verifyDocumentSeal } from "@/lib/crypto-integrity";
import { adminRoute, getIp, notFound } from "@/lib/http";
import { readObject } from "@/lib/storage";

/**
 * Live cryptographic integrity check:
 * 1. Re-reads raw file bytes from storage and verifies SHA-256 matches `documents.sha256Hash`
 * 2. Verifies HMAC-SHA256 `integritySeal` against approval metadata
 */
export const POST = adminRoute("documents.read", async ({ req, staff, params }) => {
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, params.id)).limit(1);
  if (!doc) throw notFound("Document not found");

  const now = new Date();
  let actualHash: string | null = null;
  let storageReadable = false;

  try {
    const buf = await readObject(doc.storageKey);
    actualHash = computeSha256(buf);
    storageReadable = true;
  } catch {
    storageReadable = false;
  }

  const sha256Match = Boolean(storageReadable && doc.sha256Hash && actualHash === doc.sha256Hash);
  const sealValid = Boolean(
    doc.status === "approved" &&
    doc.sha256Hash &&
    doc.approvedBy &&
    doc.approvedAt &&
    verifyDocumentSeal(
      {
        id: doc.id,
        propertyId: doc.propertyId,
        sha256Hash: doc.sha256Hash,
        approvedBy: doc.approvedBy,
        approvedAt: doc.approvedAt.toISOString(),
      },
      doc.integritySeal,
    ),
  );

  const intact = storageReadable && (doc.sha256Hash ? sha256Match : true) && (doc.integritySeal ? sealValid : true);

  if (storageReadable && !intact) {
    await db
      .update(schema.documents)
      .set({ fraudFlag: "tamper_detected", lastVerifiedAt: now })
      .where(eq(schema.documents.id, doc.id));

    await audit(
      { type: "staff", id: staff.id },
      "security.document_tamper_detected",
      {
        entity: "document",
        entityId: doc.id,
        meta: { expectedHash: doc.sha256Hash, actualHash, sealValid },
        ip: getIp(req),
      },
    );
  } else if (intact) {
    await db
      .update(schema.documents)
      .set({ lastVerifiedAt: now })
      .where(eq(schema.documents.id, doc.id));
  }

  return {
    documentId: doc.id,
    intact,
    storageReadable,
    sha256Match,
    sealValid,
    expectedHash: doc.sha256Hash,
    actualHash,
    checkedAt: now.toISOString(),
  };
});
