import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, forbidden, getIp, notFound, parseBody } from "@/lib/http";
import { can } from "@/lib/rbac";
import { DOC_KINDS } from "@/lib/documents";
import { deleteObject, signedUrl } from "@/lib/storage";
import { notifyCustomer } from "@/lib/notify";
import { audit } from "@/lib/audit";

const Id = z.string().uuid();
const strip = <T extends { storageKey: string }>(r: T) => { const { storageKey: _k, ...rest } = r; void _k; return rest; };

async function loadGroup(id: string) {
  if (!Id.safeParse(id).success) throw notFound();
  const [row] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!row) throw notFound();
  const versions = await db.select().from(schema.documents).where(eq(schema.documents.groupId, row.groupId)).orderBy(desc(schema.documents.version));
  return { row, versions, current: versions[0] };
}

/** Any version id returns the document's current state, inline preview URL, vetting logs, and version history. */
export const GET = adminRoute("documents.read", async ({ req, params }) => {
  const { versions, current } = await loadGroup(params.id);
  const [[prop], [cust], [uploader], vettingLogs] = await Promise.all([
    current.propertyId ? db.select({ name: schema.properties.name }).from(schema.properties).where(eq(schema.properties.id, current.propertyId)) : Promise.resolve([]),
    current.customerId ? db.select({ name: schema.customers.fullName, email: schema.customers.email }).from(schema.customers).where(eq(schema.customers.id, current.customerId)) : Promise.resolve([]),
    current.uploadedBy ? db.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, current.uploadedBy)) : Promise.resolve([]),
    db
      .select({
        id: schema.documentVettingLogs.id,
        stage: schema.documentVettingLogs.stage,
        passed: schema.documentVettingLogs.passed,
        notes: schema.documentVettingLogs.notes,
        checklist: schema.documentVettingLogs.checklist,
        createdAt: schema.documentVettingLogs.createdAt,
        reviewerName: schema.staff.name,
      })
      .from(schema.documentVettingLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.documentVettingLogs.reviewerId))
      .where(eq(schema.documentVettingLogs.documentId, current.id))
      .orderBy(desc(schema.documentVettingLogs.createdAt)),
  ]);
  const previewUrl = await signedUrl(current.storageKey, new URL(req.url).origin, current.title, 600);
  return {
    document: {
      ...strip(current),
      propertyName: prop?.name ?? null,
      customerName: cust?.name ?? null,
      customerEmail: cust?.email ?? null,
      uploaderName: uploader?.name ?? null,
      previewUrl,
    },
    versions: versions.map(strip),
    vettingLogs,
  };
});

const Patch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  kind: z.enum(DOC_KINDS).optional(),
  visibility: z.enum(["request_only", "customer_only", "public"]).optional(),
  customerId: z.string().uuid().nullable().optional(), // assign (or unassign) a customer
  propertyId: z.string().uuid().nullable().optional(),
});

/** Details apply to every version of the document, so they never drift apart. */
export const PATCH = adminRoute("documents.write", async ({ req, staff, params }) => {
  const body = await parseBody(req, Patch);
  if (!Object.keys(body).length) throw badRequest("Nothing to update");
  const { row, current } = await loadGroup(params.id);
  // An approved document was already vetted for its audience. Re-pointing it (public, or another customer)
  // would bypass that review, so it needs approval-level rights.
  const changesAudience = (body.visibility !== undefined && body.visibility !== current.visibility)
    || (body.customerId !== undefined && body.customerId !== current.customerId)
    || (body.propertyId !== undefined && body.propertyId !== current.propertyId);
  if (current.status === "approved" && changesAudience && !can(staff.role, "documents.approve")) {
    throw forbidden("Changing who can see an approved document needs approval rights");
  }
  const nextCustomer = body.customerId === undefined ? current.customerId : body.customerId;
  const nextProperty = body.propertyId === undefined ? current.propertyId : body.propertyId;
  if (!nextCustomer && !nextProperty) throw badRequest("A document must belong to a property or a customer");
  if (body.customerId) {
    const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, body.customerId));
    if (!c) throw badRequest("That customer does not exist");
  }
  if (body.propertyId) {
    const [p] = await db.select({ id: schema.properties.id }).from(schema.properties).where(and(eq(schema.properties.id, body.propertyId), isNull(schema.properties.deletedAt)));
    if (!p) throw badRequest("That property does not exist");
  }
  await db.update(schema.documents).set(body).where(eq(schema.documents.groupId, row.groupId));
  if (body.customerId && body.customerId !== current.customerId && current.status === "approved") {
    await notifyCustomer(body.customerId, { type: "document_uploaded", title: "New document available", body: `"${current.title}" has been added to your document vault.` });
  }
  await audit({ type: "staff", id: staff.id }, "document.update", { entity: "document", entityId: current.id, meta: { fields: Object.keys(body) }, ip: getIp(req) });
  const [fresh] = await db.select().from(schema.documents).where(eq(schema.documents.id, current.id));
  return strip(fresh);
});

/** Removes every version and its stored file. Needs approval-level permission. */
export const DELETE = adminRoute("documents.approve", async ({ req, staff, params }) => {
  const { row, versions, current } = await loadGroup(params.id);
  await db.delete(schema.documents).where(eq(schema.documents.groupId, row.groupId));
  await Promise.all(versions.map((v) => deleteObject(v.storageKey).catch((e) => console.error("file delete failed", v.storageKey, e))));
  await audit({ type: "staff", id: staff.id }, "document.delete", { entity: "document", entityId: current.id, meta: { versions: versions.length, title: current.title }, ip: getIp(req) });
  return { ok: true };
});
