import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, parseQuery, preflight } from "@/lib/http";
import { PageQuery, offset, paged } from "@/lib/query";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ req, customer }) => {
  const q = parseQuery(req, PageQuery);
  const mine = eq(schema.notifications.customerId, customer.id);
  const [items, [{ n }], [{ u }]] = await Promise.all([
    db.select().from(schema.notifications).where(mine).orderBy(desc(schema.notifications.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(mine),
    db.select({ u: sql<number>`count(*)::int` }).from(schema.notifications).where(and(mine, isNull(schema.notifications.readAt))),
  ]);
  return { ...paged(items.map(({ id, type, title, body, readAt, createdAt }) => ({ id, type, title, body, readAt, createdAt })), n, q), unread: u };
}, { name: "notifications" });
