import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, notFound, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireUuid } from "../../agents/_id";
import { customerColumns, customerScope } from "../_columns";

export const GET = adminRoute("customers.read", async ({ params, staff }) => {
  const id = requireUuid(params.id);
  const [customer] = await db.select(customerColumns).from(schema.customers).where(and(eq(schema.customers.id, id), customerScope(staff)));
  if (!customer) throw notFound();
  const [leads, inspections, reservations, transactions, payments, documents] = await Promise.all([
    db.select({ id: schema.leads.id, status: schema.leads.status, source: schema.leads.source, propertyName: schema.properties.name, createdAt: schema.leads.createdAt })
      .from(schema.leads).leftJoin(schema.properties, eq(schema.leads.propertyId, schema.properties.id)).where(eq(schema.leads.customerId, id)).orderBy(desc(schema.leads.createdAt)).limit(50),
    db.select({ id: schema.inspections.id, kind: schema.inspections.kind, status: schema.inspections.status, preferredDate: schema.inspections.preferredDate, preferredTime: schema.inspections.preferredTime, propertyName: schema.properties.name })
      .from(schema.inspections).innerJoin(schema.properties, eq(schema.inspections.propertyId, schema.properties.id)).where(eq(schema.inspections.customerId, id)).orderBy(desc(schema.inspections.createdAt)).limit(50),
    db.select({ id: schema.reservations.id, status: schema.reservations.status, amountKobo: schema.reservations.amountKobo, expiresAt: schema.reservations.expiresAt, propertyName: schema.properties.name })
      .from(schema.reservations).innerJoin(schema.properties, eq(schema.reservations.propertyId, schema.properties.id)).where(eq(schema.reservations.customerId, id)).orderBy(desc(schema.reservations.createdAt)).limit(50),
    db.select({ id: schema.transactions.id, reference: schema.transactions.reference, stage: schema.transactions.stage, priceKobo: schema.transactions.priceKobo, propertyName: schema.properties.name, createdAt: schema.transactions.createdAt })
      .from(schema.transactions).innerJoin(schema.properties, eq(schema.transactions.propertyId, schema.properties.id)).where(eq(schema.transactions.customerId, id)).orderBy(desc(schema.transactions.createdAt)).limit(50),
    db.select({ id: schema.payments.id, reference: schema.payments.reference, kind: schema.payments.kind, status: schema.payments.status, amountKobo: schema.payments.amountKobo, paidAt: schema.payments.paidAt, createdAt: schema.payments.createdAt })
      .from(schema.payments).where(eq(schema.payments.customerId, id)).orderBy(desc(schema.payments.createdAt)).limit(50),
    // storageKey is deliberately not returned
    db.select({ id: schema.documents.id, title: schema.documents.title, kind: schema.documents.kind, status: schema.documents.status, version: schema.documents.version, createdAt: schema.documents.createdAt })
      .from(schema.documents).where(eq(schema.documents.customerId, id)).orderBy(desc(schema.documents.createdAt)).limit(50),
  ]);
  return { customer, leads, inspections, reservations, transactions, payments, documents };
});

export const PATCH = adminRoute("customers.write", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const { blocked } = await parseBody(req, z.object({ blocked: z.boolean() }));
  const [cur] = await db.select({ tv: schema.customers.tokenVersion }).from(schema.customers).where(eq(schema.customers.id, id));
  if (!cur) throw notFound();
  // bumping tokenVersion signs the customer out everywhere (customerRoute compares it on every request)
  const [row] = await db.update(schema.customers).set({ blocked, tokenVersion: blocked ? cur.tv + 1 : cur.tv }).where(eq(schema.customers.id, id)).returning(customerColumns);
  await audit({ type: "staff", id: staff.id }, blocked ? "customer.block" : "customer.unblock", { entity: "customer", entityId: id, ip: getIp(req) });
  return row;
});
