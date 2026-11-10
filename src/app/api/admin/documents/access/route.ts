import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, parseQuery } from "@/lib/http";
import { PageQuery, offset, paged } from "@/lib/query";

const Q = PageQuery.extend({ status: z.enum(["pending", "approved", "denied"]).optional() });

/** Buyers asking to see documents that are "request only". */
export const GET = adminRoute("documents.read", async ({ req }) => {
  const q = parseQuery(req, Q);
  const a = schema.documentAccess;
  const conds: (SQL | undefined)[] = [];
  if (q.status) conds.push(eq(a.status, q.status));
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db.select({
      id: a.id, status: a.status, createdAt: a.createdAt, decidedAt: a.decidedAt, documentId: a.documentId, customerId: a.customerId,
      documentTitle: schema.documents.title, documentKind: schema.documents.kind, propertyId: schema.documents.propertyId,
      customerName: schema.customers.fullName, customerEmail: schema.customers.email,
    }).from(a)
      .innerJoin(schema.documents, eq(schema.documents.id, a.documentId))
      .innerJoin(schema.customers, eq(schema.customers.id, a.customerId))
      .where(where).orderBy(desc(a.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(a).where(where),
  ]);
  return paged(items, n, q);
});
