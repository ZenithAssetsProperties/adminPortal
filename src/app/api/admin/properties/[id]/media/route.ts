import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, badRequest, getIp, notFound, parseBody } from "@/lib/http";
import { IMAGE_MIMES, MAX_UPLOAD_BYTES, deleteObject, newKey, putObject, signedUrl, sniffType } from "@/lib/storage";
import { audit } from "@/lib/audit";

const KINDS = ["photo", "video", "floorplan", "siteplan", "drone", "tour360"] as const;

async function ensureProperty(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw notFound();
  const [p] = await db.select({ id: schema.properties.id, cover: schema.properties.coverImage })
    .from(schema.properties).where(and(eq(schema.properties.id, id), isNull(schema.properties.deletedAt)));
  if (!p) throw notFound();
  return p;
}

/**
 * Add media. Two ways:
 *  - multipart/form-data with a `file` (jpeg/png/webp images; floor/site plans may also be PDF) and `kind`
 *  - JSON { kind, url, caption } for videos, drone footage and 360 tours hosted elsewhere (YouTube, Matterport...)
 */
export const POST = adminRoute("properties.write", async ({ req, staff, params }) => {
  const prop = await ensureProperty(params.id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, prop.id));
  const type = req.headers.get("content-type") ?? "";

  let values: typeof schema.propertyMedia.$inferInsert;
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const kind = z.enum(KINDS).parse(form.get("kind") ?? "photo");
    if (!(file instanceof File)) throw badRequest("Choose a file to upload");
    if (file.size > MAX_UPLOAD_BYTES) throw badRequest("File is too large (15 MB maximum)");
    const buf = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffType(buf);
    const allowPdf = kind === "floorplan" || kind === "siteplan";
    if (!sniffed || !(IMAGE_MIMES.includes(sniffed.mime) || (allowPdf && sniffed.mime === "application/pdf"))) {
      throw badRequest(allowPdf ? "Upload a JPG, PNG, WebP or PDF file" : "Upload a JPG, PNG or WebP image");
    }
    const key = newKey(`properties/${prop.id}`, sniffed.ext);
    await putObject(key, buf, sniffed.mime);
    values = { propertyId: prop.id, kind, storageKey: key, caption: String(form.get("caption") ?? "").slice(0, 200) || null, sort: n };
  } else {
    const body = await parseBody(req, z.object({
      kind: z.enum(KINDS), url: z.string().url().max(500).refine((u) => /^https:\/\//i.test(u), "Use an https link"),
      caption: z.string().max(200).optional(),
    }));
    values = { propertyId: prop.id, kind: body.kind, url: body.url, caption: body.caption ?? null, sort: n };
  }
  const [row] = await db.insert(schema.propertyMedia).values(values).returning();
  // first photo becomes the cover automatically
  if (row.kind === "photo" && row.storageKey && !prop.cover) {
    await db.update(schema.properties).set({ coverImage: row.storageKey }).where(eq(schema.properties.id, prop.id));
  }
  await audit({ type: "staff", id: staff.id }, "property.media_add", { entity: "property", entityId: prop.id, meta: { kind: row.kind }, ip: getIp(req) });
  return Response.json(row, { status: 201 });
});

/** Remove a media item, or make a photo the cover:  DELETE ?mediaId=...   PATCH { mediaId, cover: true } */
export const DELETE = adminRoute("properties.write", async ({ req, staff, params }) => {
  const prop = await ensureProperty(params.id);
  const mediaId = z.string().uuid().parse(req.nextUrl.searchParams.get("mediaId"));
  const [m] = await db.delete(schema.propertyMedia).where(and(eq(schema.propertyMedia.id, mediaId), eq(schema.propertyMedia.propertyId, prop.id))).returning();
  if (!m) throw notFound();
  if (m.storageKey) {
    await deleteObject(m.storageKey).catch(() => {});
    if (prop.cover === m.storageKey) await db.update(schema.properties).set({ coverImage: null }).where(eq(schema.properties.id, prop.id));
  }
  await audit({ type: "staff", id: staff.id }, "property.media_remove", { entity: "property", entityId: prop.id, ip: getIp(req) });
  return { ok: true };
});

export const PATCH = adminRoute("properties.write", async ({ req, params }) => {
  const prop = await ensureProperty(params.id);
  const { mediaId } = await parseBody(req, z.object({ mediaId: z.string().uuid() }));
  const [m] = await db.select().from(schema.propertyMedia).where(and(eq(schema.propertyMedia.id, mediaId), eq(schema.propertyMedia.propertyId, prop.id)));
  if (!m || m.kind !== "photo" || !m.storageKey) throw badRequest("Only an uploaded photo can be the cover");
  await db.update(schema.properties).set({ coverImage: m.storageKey, updatedAt: new Date() }).where(eq(schema.properties.id, prop.id));
  return { ok: true };
});

export const GET = adminRoute("properties.read", async ({ req, params }) => {
  const prop = await ensureProperty(params.id);
  const origin = new URL(req.url).origin;
  const rows = await db.select().from(schema.propertyMedia).where(eq(schema.propertyMedia.propertyId, prop.id)).orderBy(schema.propertyMedia.sort);
  const items = await Promise.all(rows.map(async (m) => ({
    ...m, previewUrl: m.storageKey ? await signedUrl(m.storageKey, origin, undefined, 900) : m.url,
    isCover: Boolean(m.storageKey && m.storageKey === prop.cover),
  })));
  return { items };
});
