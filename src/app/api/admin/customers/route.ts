import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, parseQuery } from "@/lib/http";
import { customerColumns, customerScope } from "./_columns";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { maskEmail, maskName, maskPhone } from "@/lib/privacy";

const Q = PageQuery.extend({ blocked: z.enum(["1", "0"]).optional(), diaspora: z.enum(["1", "0"]).optional() });

export const GET = adminRoute("customers.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const conds: (SQL | undefined)[] = [customerScope(staff)];
  if (q.blocked) conds.push(eq(schema.customers.blocked, q.blocked === "1"));
  if (q.diaspora) conds.push(eq(schema.customers.isDiaspora, q.diaspora === "1"));
  if (q.q) {
    const l = likeEscape(q.q);
    conds.push(or(ilike(schema.customers.fullName, l), ilike(schema.customers.email, l), ilike(schema.customers.phone, l)));
  }
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db.select(customerColumns).from(schema.customers).where(where).orderBy(desc(schema.customers.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(where),
  ]);
  const piiLevel = staff.piiAccessLevel ?? "full";
  const maskedItems = piiLevel === "full" ? items : items.map((c) => ({
    ...c,
    fullName: maskName(c.fullName, piiLevel),
    email: maskEmail(c.email, piiLevel),
    phone: c.phone ? maskPhone(c.phone, piiLevel) : null,
  }));
  return paged(maskedItems, n, q);
});
