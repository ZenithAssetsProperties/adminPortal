import { and, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { PageQuery, likeEscape } from "@/lib/query";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PaymentQuery = PageQuery.extend({
  status: z.enum(["pending", "success", "failed", "abandoned"]).optional(),
  from: Day.optional(), to: Day.optional(), transactionId: z.string().uuid().optional(),
});

const p = schema.payments;
/** Shared by the list and the CSV export. `to` includes that whole day. */
export function paymentFilters(q: z.infer<typeof PaymentQuery>) {
  const conds: (SQL | undefined)[] = [];
  if (q.status) conds.push(eq(p.status, q.status));
  if (q.transactionId) conds.push(eq(p.transactionId, q.transactionId));
  if (q.from) conds.push(gte(p.createdAt, new Date(`${q.from}T00:00:00Z`)));
  if (q.to) conds.push(lt(p.createdAt, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000)));
  if (q.q) { const l = likeEscape(q.q); conds.push(or(ilike(p.reference, l), ilike(schema.customers.fullName, l), ilike(schema.transactions.reference, l))); }
  return and(...conds);
}

export const paymentSelect = () => db.select({
  p, customerName: schema.customers.fullName, propertyName: schema.properties.name, transactionRef: schema.transactions.reference,
}).from(p).innerJoin(schema.transactions, eq(p.transactionId, schema.transactions.id))
  .innerJoin(schema.customers, eq(p.customerId, schema.customers.id)).innerJoin(schema.properties, eq(schema.transactions.propertyId, schema.properties.id));

/** Spreadsheet programs run cells starting with = + - @ as formulas, so those get a leading quote. */
export const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
