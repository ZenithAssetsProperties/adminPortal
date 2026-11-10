import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, notFound, parseBody } from "@/lib/http";
import { PropertyPatch } from "@/lib/validation/property";
import { audit } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";

const Id = z.string().uuid();
const live = (id: string) => and(eq(schema.properties.id, id), isNull(schema.properties.deletedAt));

export const GET = adminRoute("properties.read", async ({ params }) => {
  if (!Id.safeParse(params.id).success) throw notFound();
  const [row] = await db.select().from(schema.properties).where(live(params.id));
  if (!row) throw notFound();
  const media = await db.select().from(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, row.id)).orderBy(schema.propertyMedia.sort);
  return { ...row, media };
});

export const PATCH = adminRoute("properties.write", async ({ req, staff, params }) => {
  if (!Id.safeParse(params.id).success) throw notFound();
  const body = await parseBody(req, PropertyPatch);
  if (!Object.keys(body).length) throw badRequest("Nothing to update");
  const [row] = await db.update(schema.properties).set({ ...body, updatedAt: new Date() }).where(live(params.id)).returning();
  if (!row) throw notFound();
  await audit({ type: "staff", id: staff.id }, "property.update", { entity: "property", entityId: row.id, meta: { fields: Object.keys(body) }, ip: getIp(req) });
  return row;
});

// Soft delete: records tied to the property (transactions, receipts) must stay intact.
export const DELETE = adminRoute("properties.delete", async ({ req, staff, params }) => {
  if (!Id.safeParse(params.id).success) throw notFound();
  const [row] = await db.update(schema.properties).set({ deletedAt: new Date(), status: "draft", updatedAt: new Date() }).where(live(params.id)).returning();
  if (!row) throw notFound();
  const media = await db.select().from(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, row.id));
  await Promise.all(media.filter((m) => m.storageKey).map((m) => deleteObject(m.storageKey!).catch(() => {})));
  await db.delete(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, row.id));
  await audit({ type: "staff", id: staff.id }, "property.delete", { entity: "property", entityId: row.id, ip: getIp(req) });
  return { ok: true };
});
