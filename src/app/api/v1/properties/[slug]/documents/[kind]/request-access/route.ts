import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { badRequest, customerRoute, notFound, preflight } from "@/lib/http";
import { notifyStaff } from "@/lib/notify";
import { publicVisible } from "@/lib/public-dto";

export const OPTIONS = preflight;
// Ask Zenith for access to a property's sensitive document (PRD 9). Staff approve it in the back office.
export const POST = customerRoute(async ({ customer, params }) => {
  const kind = z.enum(schema.docKind.enumValues).safeParse(params.kind);
  if (!kind.success) throw badRequest("Unknown document type");
  const [p] = await db.select().from(schema.properties).where(and(eq(schema.properties.slug, params.slug), publicVisible));
  if (!p) throw notFound("Property not found");
  const docs = await db.select().from(schema.documents).where(and(
    eq(schema.documents.propertyId, p.id), isNull(schema.documents.customerId), eq(schema.documents.kind, kind.data), eq(schema.documents.status, "approved"),
  )).orderBy(desc(schema.documents.version));
  const seen = new Set<string>();
  const current = docs.filter((d) => !seen.has(d.groupId) && seen.add(d.groupId));
  if (!current.length) throw notFound("That document is not available for this property");
  if (current.every((d) => d.visibility === "public")) throw badRequest("This document is already public");

  await db.insert(schema.documentAccess).values(current.filter((d) => d.visibility !== "public").map((d) => ({ documentId: d.id, customerId: customer.id }))).onConflictDoNothing();
  const rows = await db.select({ status: schema.documentAccess.status }).from(schema.documentAccess)
    .where(and(eq(schema.documentAccess.customerId, customer.id), eq(schema.documentAccess.documentId, current[0].id)));
  await notifyStaff(p.agentId, { type: "document_access_request", title: "Document access requested", body: `${customer.fullName} asked to review the ${kind.data.replaceAll("_", " ")} for ${p.name}.` });
  return Response.json({ ok: true, status: rows[0]?.status ?? "pending" }, { status: 202 });
}, { name: "doc-request", limit: 20 });
