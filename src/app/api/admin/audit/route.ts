import { and, count, desc, eq, gte, ilike, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { maskIp } from "@/lib/privacy";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const Q = PageQuery.extend({
  action: z.string().trim().max(80).optional(),
  actorType: z.enum(["staff", "customer", "system"]).optional(),
  entity: z.string().trim().max(60).optional(),
  from: Day.optional(),
  to: Day.optional(),
});

// Read-only on purpose: there is no route that changes or removes audit rows.
export const GET = adminRoute("audit.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const a = schema.auditLogs;
  const conds: (SQL | undefined)[] = [];
  if (q.action) conds.push(ilike(a.action, `${likeEscape(q.action).slice(1, -1)}%`));
  if (q.actorType) conds.push(eq(a.actorType, q.actorType));
  if (q.entity) conds.push(eq(a.entity, q.entity));
  if (q.from) conds.push(gte(a.createdAt, new Date(`${q.from}T00:00:00.000Z`)));
  if (q.to) conds.push(lt(a.createdAt, new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + 86_400_000)));
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db.select({
      id: a.id, actorType: a.actorType, actorId: a.actorId, action: a.action, entity: a.entity, entityId: a.entityId,
      meta: a.meta, ip: a.ip, createdAt: a.createdAt, actorName: schema.staff.name,
    }).from(a).leftJoin(schema.staff, and(eq(schema.staff.id, a.actorId), eq(a.actorType, "staff")))
      .where(where).orderBy(desc(a.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: count() }).from(a).where(where),
  ]);
  const piiLevel = staff.piiAccessLevel ?? "full";
  const maskedItems = piiLevel === "full" ? items : items.map((row) => ({
    ...row,
    ip: row.ip ? maskIp(row.ip, piiLevel) : null,
  }));
  return paged(maskedItems, Number(n), q);
});
