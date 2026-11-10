import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody } from "@/lib/http";
import { notifyCustomer } from "@/lib/notify";
import { releasePropertyIfFree } from "@/lib/reservations";
import { audit } from "@/lib/audit";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("extend"), days: z.number().int().min(1).max(90) }),
]);

export const PATCH = adminRoute("reservations.write", async ({ req, staff, params }) => {
  const body = await parseBody(req, Body);
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const row = await db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.reservations).where(eq(schema.reservations.id, params.id)).for("update");
    if (!r) throw notFound();
    if (body.action === "cancel") {
      if (r.status !== "active" && r.status !== "pending") throw conflict(`This reservation is already ${r.status}`);
      const [u] = await tx.update(schema.reservations).set({ status: "cancelled" }).where(eq(schema.reservations.id, r.id)).returning();
      await releasePropertyIfFree(tx, r.propertyId, r.id);
      return u;
    }
    if (r.status !== "active") throw conflict("Only an active reservation can be extended");
    // extend from the later of "now" and the current expiry, so an overdue hold is not shortened
    const start = Math.max(Date.now(), r.expiresAt?.getTime() ?? 0);
    const [u] = await tx.update(schema.reservations).set({ expiresAt: new Date(start + body.days * 86_400_000) }).where(eq(schema.reservations.id, r.id)).returning();
    return u;
  });
  await notifyCustomer(row.customerId, body.action === "cancel"
    ? { type: "reservation_cancelled", title: "Reservation cancelled", body: "Your property reservation has been cancelled. Contact us if this is unexpected." }
    : { type: "reservation_extended", title: "Reservation extended", body: `Your reservation now runs until ${row.expiresAt!.toDateString()}.` });
  await audit({ type: "staff", id: staff.id }, `reservation.${body.action}`, { entity: "reservation", entityId: row.id, ip: getIp(req) });
  return row;
});
