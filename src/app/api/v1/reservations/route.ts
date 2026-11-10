import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { customerRoute, parseBody, preflight } from "@/lib/http";
import { createReservation } from "@/lib/checkout";

export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const rows = await db.select({ r: schema.reservations, name: schema.properties.name, slug: schema.properties.slug })
    .from(schema.reservations).innerJoin(schema.properties, eq(schema.properties.id, schema.reservations.propertyId))
    .where(eq(schema.reservations.customerId, customer.id)).orderBy(desc(schema.reservations.createdAt));
  return { items: rows.map(({ r, name, slug }) => ({ id: r.id, status: r.status, amountKobo: r.amountKobo, expiresAt: r.expiresAt, createdAt: r.createdAt, property: { name, slug } })) };
}, { name: "reservations" });

export const POST = customerRoute(async ({ req, customer }) => {
  const b = await parseBody(req, z.object({ propertySlug: z.string().trim().min(1).max(200), acceptTerms: z.literal(true) }));
  const r = await createReservation(customer, b.propertySlug, b.acceptTerms);
  return Response.json({
    reservationId: r.reservation.id, reservationStatus: r.reservation.status, transactionId: r.transaction.id,
    reference: r.payment?.reference ?? null, amountKobo: r.reservation.amountKobo, authorizationUrl: r.authorizationUrl, expiresAt: r.reservation.expiresAt,
  }, { status: 201 });
}, { name: "reserve", limit: 10 });
