import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody } from "@/lib/http";
import { notifyCustomer } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { computeSha256, signDocumentSeal } from "@/lib/crypto-integrity";
import { readObject } from "@/lib/storage";

/** Approve or reject the current version. Approving generates a tamper-evident HMAC-SHA256 seal. */
export const POST = adminRoute("documents.approve", async ({ req, staff, params }) => {
  const { decision } = await parseBody(req, z.object({ decision: z.enum(["approve", "reject"]) }));
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, params.id));
  if (!doc) throw notFound();
  const [latest] = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.groupId, doc.groupId)).orderBy(desc(schema.documents.version)).limit(1);
  if (latest.id !== doc.id) throw conflict("This is an older version. Review the current version instead.");

  const now = new Date();
  const status = decision === "approve" ? "approved" : "rejected";

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
      lastVerifiedAt: status === "approved" ? now : doc.lastVerifiedAt,
    })
    .where(eq(schema.documents.id, doc.id))
    .returning();

  if (status === "approved" && row.customerId) {
    await notifyCustomer(row.customerId, { type: "document_uploaded", title: "New document available", body: `"${row.title}" is now available in your document vault.` });
  }
  await audit({ type: "staff", id: staff.id }, `document.${decision}`, {
    entity: "document",
    entityId: row.id,
    meta: { sealed: Boolean(integritySeal), sha256Hash },
    ip: getIp(req),
  });
  const { storageKey: _k, ...safe } = row; void _k;
  return safe;
});
