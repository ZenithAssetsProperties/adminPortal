import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, notFound } from "@/lib/http";
import { readUpload } from "@/lib/documents";
import { newKey, putObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Upload a new version. Older versions stay on record; the new one starts as pending. */
export const POST = adminRoute("documents.write", async ({ req, staff, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) throw badRequest("Send the file as multipart/form-data");
  const [any] = await db.select().from(schema.documents).where(eq(schema.documents.id, params.id));
  if (!any) throw notFound();
  const file = await readUpload((await req.formData()).get("file"));
  const [latest] = await db.select().from(schema.documents).where(eq(schema.documents.groupId, any.groupId)).orderBy(desc(schema.documents.version)).limit(1);
  const key = newKey(latest.propertyId ? `documents/property/${latest.propertyId}` : `documents/customer/${latest.customerId}`, file.ext);
  await putObject(key, file.buf, file.mime);
  const [row] = await db.insert(schema.documents).values({
    groupId: latest.groupId, version: latest.version + 1, kind: latest.kind, title: latest.title,
    propertyId: latest.propertyId, customerId: latest.customerId, transactionId: latest.transactionId,
    visibility: latest.visibility, storageKey: key, mimeType: file.mime, sizeBytes: file.size, status: "pending", uploadedBy: staff.id,
  }).returning();
  await audit({ type: "staff", id: staff.id }, "document.new_version", { entity: "document", entityId: row.id, meta: { version: row.version }, ip: getIp(req) });
  const { storageKey: _k, ...safe } = row; void _k;
  return Response.json(safe, { status: 201 });
});
