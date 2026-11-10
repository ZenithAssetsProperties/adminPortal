import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody } from "@/lib/http";
import { notifyCustomer } from "@/lib/notify";
import { audit } from "@/lib/audit";

/** Approve or reject the current version. Only approved documents can ever be shown to buyers. */
export const POST = adminRoute("documents.approve", async ({ req, staff, params }) => {
  const { decision } = await parseBody(req, z.object({ decision: z.enum(["approve", "reject"]) }));
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, params.id));
  if (!doc) throw notFound();
  const [latest] = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.groupId, doc.groupId)).orderBy(desc(schema.documents.version)).limit(1);
  if (latest.id !== doc.id) throw conflict("This is an older version. Review the current version instead.");
  const status = decision === "approve" ? "approved" : "rejected";
  const [row] = await db.update(schema.documents).set({ status, approvedBy: staff.id, approvedAt: new Date() }).where(eq(schema.documents.id, doc.id)).returning();
  if (status === "approved" && row.customerId) {
    await notifyCustomer(row.customerId, { type: "document_uploaded", title: "New document available", body: `"${row.title}" is now available in your document vault.` });
  }
  await audit({ type: "staff", id: staff.id }, `document.${decision}`, { entity: "document", entityId: row.id, ip: getIp(req) });
  const { storageKey: _k, ...safe } = row; void _k;
  return safe;
});
