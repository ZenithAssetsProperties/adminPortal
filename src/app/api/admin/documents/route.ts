import { and, desc, eq, ilike, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { DOC_KINDS, currentVersionOnly, formFields, readUpload } from "@/lib/documents";
import { newKey, putObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

const Q = PageQuery.extend({
  propertyId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  kind: z.enum(DOC_KINDS).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

// The list shows only the current (newest) version of each document. Storage keys are never returned.
export const GET = adminRoute("documents.read", async ({ req }) => {
  const q = parseQuery(req, Q);
  const d = schema.documents;
  const conds: (SQL | undefined)[] = [currentVersionOnly];
  if (q.propertyId) conds.push(eq(d.propertyId, q.propertyId));
  if (q.customerId) conds.push(eq(d.customerId, q.customerId));
  if (q.kind) conds.push(eq(d.kind, q.kind));
  if (q.status) conds.push(eq(d.status, q.status));
  if (q.q) conds.push(ilike(d.title, likeEscape(q.q)));
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db.select({
      id: d.id, groupId: d.groupId, version: d.version, kind: d.kind, title: d.title, status: d.status, visibility: d.visibility,
      propertyId: d.propertyId, customerId: d.customerId, transactionId: d.transactionId, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
      sha256Hash: d.sha256Hash, fraudFlag: d.fraudFlag, lastVerifiedAt: d.lastVerifiedAt,
      isSealed: sql<boolean>`${d.integritySeal} is not null`,
      createdAt: d.createdAt, propertyName: schema.properties.name, customerName: schema.customers.fullName,
      versionCount: sql<number>`(select count(*) from documents d3 where d3.group_id = ${d.groupId})::int`,
    }).from(d)
      .leftJoin(schema.properties, eq(schema.properties.id, d.propertyId))
      .leftJoin(schema.customers, eq(schema.customers.id, d.customerId))
      .where(where).orderBy(desc(d.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(d).where(where),
  ]);
  return paged(items, n, q);
});

const Meta = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(DOC_KINDS).default("other"),
  propertyId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  visibility: z.enum(["request_only", "customer_only", "public"]).optional(),
});

export const POST = adminRoute("documents.write", async ({ req, staff }) => {
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) throw badRequest("Send the file as multipart/form-data");
  const form = await req.formData();
  const meta = Meta.parse(formFields(form));
  if (!meta.propertyId && !meta.customerId) throw badRequest("Attach the document to a property or a customer");

  // foreign keys are checked up front so a bad id gives a clear message, not a server error
  if (meta.propertyId) {
    const [p] = await db.select({ id: schema.properties.id }).from(schema.properties).where(and(eq(schema.properties.id, meta.propertyId), isNull(schema.properties.deletedAt)));
    if (!p) throw badRequest("That property does not exist");
  }
  if (meta.customerId) {
    const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, meta.customerId));
    if (!c) throw badRequest("That customer does not exist");
  }
  if (meta.transactionId) {
    const [t] = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.id, meta.transactionId));
    if (!t) throw badRequest("That transaction does not exist");
  }

  const file = await readUpload(form.get("file"));

  // Anti-fraud check: detect if the exact file (SHA-256) is already attached to a different property
  if (meta.propertyId) {
    const [dupDoc] = await db
      .select({ id: schema.documents.id, propertyId: schema.documents.propertyId, title: schema.documents.title })
      .from(schema.documents)
      .where(and(eq(schema.documents.sha256Hash, file.sha256Hash), ne(schema.documents.propertyId, meta.propertyId)))
      .limit(1);

    if (dupDoc) {
      await audit(
        { type: "staff", id: staff.id },
        "security.duplicate_document_blocked",
        {
          entity: "property",
          entityId: meta.propertyId,
          meta: { sha256Hash: file.sha256Hash, conflictingDocumentId: dupDoc.id, conflictingPropertyId: dupDoc.propertyId },
          ip: getIp(req),
        },
      );
      throw badRequest("Duplicate document detected: this exact file is already registered to another property.");
    }
  }

  const key = newKey(meta.propertyId ? `documents/property/${meta.propertyId}` : `documents/customer/${meta.customerId}`, file.ext);
  await putObject(key, file.buf, file.mime);
  const [row] = await db.insert(schema.documents).values({
    groupId: crypto.randomUUID(), version: 1, kind: meta.kind, title: meta.title,
    propertyId: meta.propertyId ?? null, customerId: meta.customerId ?? null, transactionId: meta.transactionId ?? null,
    storageKey: key, mimeType: file.mime, sizeBytes: file.size, sha256Hash: file.sha256Hash, status: "pending",
    visibility: meta.visibility ?? (meta.customerId && !meta.propertyId ? "customer_only" : "request_only"),
    uploadedBy: staff.id,
  }).returning();
  await audit({ type: "staff", id: staff.id }, "document.upload", { entity: "document", entityId: row.id, meta: { kind: row.kind, version: 1, sha256Hash: file.sha256Hash }, ip: getIp(req) });
  const { storageKey: _omit, ...safe } = row; void _omit;
  return Response.json(safe, { status: 201 });
});
