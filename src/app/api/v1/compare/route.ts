import { and, eq, inArray , isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { badRequest, parseQuery, preflight, publicRoute } from "@/lib/http";
import { DOC_LABELS, cardDto, originOf, publicVisible } from "@/lib/public-dto";

const Q = z.object({ slugs: z.string().max(400) });

export const OPTIONS = preflight;
export const GET = publicRoute(async ({ req }) => {
  const slugs = [...new Set(parseQuery(req, Q).slugs.split(",").map((s) => s.trim()).filter(Boolean))];
  if (slugs.length < 2 || slugs.length > 4) throw badRequest("Compare between 2 and 4 properties");
  const rows = await db.select().from(schema.properties).where(and(publicVisible, inArray(schema.properties.slug, slugs)));
  if (rows.length < 2) throw badRequest("At least two of those properties must exist");
  const origin = originOf(req);
  const docs = await db.select({ propertyId: schema.documents.propertyId, kind: schema.documents.kind }).from(schema.documents)
    .where(and(inArray(schema.documents.propertyId, rows.map((r) => r.id)), eq(schema.documents.status, "approved"), isNull(schema.documents.customerId)));
  const ordered = slugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const items = await Promise.all(ordered.map(async (p) => ({
    ...(await cardDto(p, origin)),
    documentation: [...new Set(docs.filter((d) => d.propertyId === p.id).map((d) => DOC_LABELS[d.kind] ?? d.kind))],
    inspectionAvailable: p.status === "available",
  })));
  return { items };
}, { name: "compare", limit: 60 });
