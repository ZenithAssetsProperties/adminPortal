import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, parseBody, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { PropertyInput, slugify } from "@/lib/validation/property";
import { audit } from "@/lib/audit";

const Q = PageQuery.extend({
  status: z.enum(["draft", "available", "reserved", "sold"]).optional(),
  type: z.enum(["land", "house", "apartment", "commercial"]).optional(),
});

export const GET = adminRoute("properties.read", async ({ req }) => {
  const q = parseQuery(req, Q);
  const conds: (SQL | undefined)[] = [isNull(schema.properties.deletedAt)];
  if (q.status) conds.push(eq(schema.properties.status, q.status));
  if (q.type) conds.push(eq(schema.properties.type, q.type));
  if (q.q) {
    const l = likeEscape(q.q);
    conds.push(or(ilike(schema.properties.name, l), ilike(schema.properties.city, l), ilike(schema.properties.area, l)));
  }
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db.select().from(schema.properties).where(where).orderBy(desc(schema.properties.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.properties).where(where),
  ]);
  return paged(items, n, q);
});

export const POST = adminRoute("properties.write", async ({ req, staff }) => {
  const body = await parseBody(req, PropertyInput);
  const [row] = await db.insert(schema.properties).values({ ...body, slug: slugify(body.name), createdBy: staff.id }).returning();
  await audit({ type: "staff", id: staff.id }, "property.create", { entity: "property", entityId: row.id, ip: getIp(req) });
  return Response.json(row, { status: 201 });
});
