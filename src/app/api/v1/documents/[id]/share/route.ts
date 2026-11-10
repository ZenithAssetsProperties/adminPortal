import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, getIp, notFound, preflight } from "@/lib/http";
import { originOf, uuidOr404 } from "@/lib/public-dto";
import { signedUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const OPTIONS = preflight;
// Share a one-hour link to one of YOUR OWN approved documents (view/download/share "where permitted", PRD 16).
export const POST = customerRoute(async ({ req, customer, params }) => {
  const id = uuidOr404(params.id);
  const [d] = await db.select().from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.customerId, customer.id), eq(schema.documents.status, "approved")));
  if (!d) throw notFound("Document not found");
  await audit({ type: "customer", id: customer.id }, "document.share", { entity: "document", entityId: d.id, ip: getIp(req) });
  return { url: await signedUrl(d.storageKey, originOf(req), d.title, 3600), expiresInSeconds: 3600 };
}, { name: "doc-share", limit: 20 });
