import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { isScopedToOwn } from "@/lib/rbac";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Q = PageQuery.extend({
  status: z.enum(["requested", "confirmed", "completed", "cancelled"]).optional(),
  kind: z.enum(["physical", "virtual"]).optional(),
  propertyId: z.string().uuid().optional(),
  from: Day.optional(),
  to: Day.optional(),
});

export const GET = adminRoute("inspections.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const i = schema.inspections, p = schema.properties;
  const conds: (SQL | undefined)[] = [];
  if (q.status) conds.push(eq(i.status, q.status));
  if (q.kind) conds.push(eq(i.kind, q.kind));
  if (q.propertyId) conds.push(eq(i.propertyId, q.propertyId));
  if (q.from) conds.push(gte(i.preferredDate, q.from));
  if (q.to) conds.push(lte(i.preferredDate, q.to));
  if (q.q) { const l = likeEscape(q.q); conds.push(or(ilike(i.name, l), ilike(i.phone, l), ilike(i.email, l), ilike(p.name, l))); }
  // sales agents only see inspections on their own properties or assigned to them
  if (isScopedToOwn(staff.role)) conds.push(or(eq(p.agentId, staff.id), eq(i.assignedTo, staff.id)));
  const where = and(...conds);
  const [rows, [{ n }]] = await Promise.all([
    db.select({ i, propertyName: p.name }).from(i).innerJoin(p, eq(i.propertyId, p.id)).where(where)
      .orderBy(desc(i.preferredDate), desc(i.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(i).innerJoin(p, eq(i.propertyId, p.id)).where(where),
  ]);
  return paged(rows.map((r) => ({ ...r.i, propertyName: r.propertyName })), n, q);
});
