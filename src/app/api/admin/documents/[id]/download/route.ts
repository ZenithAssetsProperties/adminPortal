import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, notFound } from "@/lib/http";
import { signedUrl } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Short-lived download link. Every download is written to the audit log. */
export const GET = adminRoute("documents.read", async ({ req, staff, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, params.id));
  if (!doc) throw notFound();
  await audit({ type: "staff", id: staff.id }, "document.download", { entity: "document", entityId: doc.id, meta: { version: doc.version }, ip: getIp(req) });
  const ext = doc.storageKey.split(".").pop();
  const url = await signedUrl(doc.storageKey, new URL(req.url).origin, `${doc.title}.${ext}`, 300);
  return { url, expiresInSeconds: 300 };
});
