import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { notifyCustomer } from "@/lib/notify";
import { formatNaira } from "@/lib/money";
import { audit } from "@/lib/audit";

const Q = PageQuery.extend({ status: z.enum(["pending", "active", "expired", "cancelled", "converted"]).optional(), propertyId: z.string().uuid().optional() });

export const GET = adminRoute("reservations.read", async ({ req }) => {
  const q = parseQuery(req, Q);
  const r = schema.reservations, p = schema.properties, c = schema.customers;
  const conds: (SQL | undefined)[] = [];
  if (q.status) conds.push(eq(r.status, q.status));
  if (q.propertyId) conds.push(eq(r.propertyId, q.propertyId));
  if (q.q) { const l = likeEscape(q.q); conds.push(or(ilike(p.name, l), ilike(c.fullName, l), ilike(c.email, l))); }
  const where = and(...conds);
  const base = () => db.select({ r, propertyName: p.name, customerName: c.fullName, customerEmail: c.email }).from(r)
    .innerJoin(p, eq(r.propertyId, p.id)).innerJoin(c, eq(r.customerId, c.id));
  const [rows, [{ n }]] = await Promise.all([
    base().where(where).orderBy(desc(r.createdAt)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(r).innerJoin(p, eq(r.propertyId, p.id)).innerJoin(c, eq(r.customerId, c.id)).where(where),
  ]);
  return paged(rows.map((x) => ({ ...x.r, propertyName: x.propertyName, customerName: x.customerName, customerEmail: x.customerEmail })), n, q);
});

const Create = z.object({
  propertyId: z.string().uuid(), customerId: z.string().uuid(),
  days: z.number().int().min(1).max(90).optional(),
});

/** Staff reserve a property for a customer (for example after a phone call or an offline deposit). */
export const POST = adminRoute("reservations.write", async ({ req, staff }) => {
  const body = await parseBody(req, Create);
  const out = await db.transaction(async (tx) => {
    const [prop] = await tx.select().from(schema.properties).where(eq(schema.properties.id, body.propertyId)).for("update");
    if (!prop || prop.deletedAt) throw notFound("Property not found");
    if (prop.status !== "available") throw conflict(`This property is ${prop.status}, so it cannot be reserved`);
    const [cust] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, body.customerId));
    if (!cust) throw notFound("Customer not found");
    const days = body.days ?? prop.reservationDays;
    const [row] = await tx.insert(schema.reservations).values({
      propertyId: prop.id, customerId: cust.id, status: "active", amountKobo: prop.reservationFeeKobo,
      expiresAt: new Date(Date.now() + days * 86_400_000), termsAcceptedAt: new Date(),
    }).returning();
    await tx.update(schema.properties).set({ status: "reserved", updatedAt: new Date() }).where(eq(schema.properties.id, prop.id));
    return { row, prop };
  });
  await notifyCustomer(out.row.customerId, {
    type: "reservation_confirmed", title: "Property reserved", sms: true,
    body: `${out.prop.name} (${formatNaira(out.prop.priceKobo)}) is reserved for you until ${out.row.expiresAt!.toDateString()}.`,
  });
  await audit({ type: "staff", id: staff.id }, "reservation.create", { entity: "reservation", entityId: out.row.id, ip: getIp(req) });
  return Response.json(out.row, { status: 201 });
});
