import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, getIp, notFound, preflight } from "@/lib/http";
import { originOf, uuidOr404 } from "@/lib/public-dto";
import { signedUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const OPTIONS = preflight;
/**
 * Allowed when the document is APPROVED and either (a) it belongs to the caller, (b) the caller has an approved access
 * grant, or (c) it is marked public. Anything else is answered exactly like a missing document.
 */
export const GET = customerRoute(async ({ req, customer, params }) => {
  const id = uuidOr404(params.id);
  const [d] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!d || d.status !== "approved") throw notFound("Document not found");
  let allowed = d.customerId === customer.id || (d.customerId === null && d.visibility === "public");
  if (!allowed && d.customerId === null) {
    const [g] = await db.select({ id: schema.documentAccess.id }).from(schema.documentAccess)
      .where(and(eq(schema.documentAccess.documentId, d.id), eq(schema.documentAccess.customerId, customer.id), eq(schema.documentAccess.status, "approved")));
    allowed = Boolean(g);
  }
  if (!allowed) throw notFound("Document not found");
  await audit({ type: "customer", id: customer.id }, "document.download", { entity: "document", entityId: d.id, ip: getIp(req) });
  return { url: await signedUrl(d.storageKey, originOf(req), d.title, 300), expiresInSeconds: 300 };
}, { name: "doc-download", limit: 60 });
