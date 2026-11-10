import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, badRequest, getIp, notFound, parseBody, preflight, publicRoute } from "@/lib/http";
import { notifyCustomer, notifyStaff, sendEmail, sendSms } from "@/lib/notify";
import { optionalCustomer } from "@/lib/customer-auth";
import { rateLimit } from "@/lib/ratelimit";

/** Today's date in Nigeria (UTC+1), so "not in the past" matches the visitor's day. */
const lagosToday = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

const Body = z.object({
  propertySlug: z.string().trim().min(1).max(200),
  kind: z.enum(["physical", "virtual"]).default("physical"),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(200).optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, e.g. 14:30"),
  visitors: z.number().int().min(1).max(20).default(1),
  specialRequest: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(80).optional(),
  website: z.string().max(200).optional(), // honeypot
});

const CONFIRMATION = "Your inspection request has been received. A Zenith Asset Group representative will contact you to confirm your appointment.";

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const b = await parseBody(req, Body);
  if (b.website) return { ok: true };
  if (Number.isNaN(Date.parse(b.preferredDate)) || b.preferredDate < lagosToday()) throw badRequest("Choose today or a future date");
  if (!(await rateLimit(`insp:${getIp(req) ?? "?"}`, 10, 3600))) throw new ApiError(429, "Too many requests, please try again later");
  // The form sends an SMS and an email to whatever contact is typed in, so also cap per recipient
  // (stops anyone using it to spam a third party, or to run up the messaging bill, by rotating IPs).
  const phoneKey = b.phone.replace(/\D/g, "").slice(-10);
  if (!(await rateLimit(`insp:phone:${phoneKey}`, 3, 86_400)) || (b.email && !(await rateLimit(`insp:email:${b.email.toLowerCase()}`, 3, 86_400)))) {
    throw new ApiError(429, "We already have requests for this contact today. A representative will be in touch.");
  }

  const [property] = await db.select().from(schema.properties).where(and(eq(schema.properties.slug, b.propertySlug), isNull(schema.properties.deletedAt)));
  if (!property || property.status === "draft") throw notFound("Property not found");
  const customer = await optionalCustomer(req);

  const row = await db.transaction(async (tx) => {
    const [lead] = await tx.insert(schema.leads).values({
      customerId: customer?.id, name: b.name, email: b.email ?? customer?.email, phone: b.phone, propertyId: property.id,
      source: b.source ?? "inspection_booking", status: "inspection_scheduled", agentId: property.agentId,
    }).returning();
    const [insp] = await tx.insert(schema.inspections).values({
      propertyId: property.id, customerId: customer?.id, leadId: lead.id, kind: b.kind, name: b.name, email: b.email ?? customer?.email,
      phone: b.phone, preferredDate: b.preferredDate, preferredTime: b.preferredTime, visitors: b.visitors, specialRequest: b.specialRequest,
    }).returning();
    return insp;
  });

  const text = `${CONFIRMATION}\n\nProperty: ${property.name}\nDate: ${b.preferredDate} at ${b.preferredTime}`;
  const email = b.email ?? customer?.email;
  await Promise.all([
    email ? sendEmail(email, "We received your inspection request", text) : Promise.resolve(),
    sendSms(b.phone, `${CONFIRMATION} (${property.name}, ${b.preferredDate} ${b.preferredTime})`),
    customer ? notifyCustomer(customer.id, { type: "inspection_requested", title: "Inspection request received", body: text, email: false }) : Promise.resolve(),
    notifyStaff(property.agentId, { type: "inspection_requested", title: "New inspection request", body: `${b.name} wants a ${b.kind} inspection of ${property.name} on ${b.preferredDate} at ${b.preferredTime}.` }),
  ]);
  return Response.json({ ok: true, inspectionId: row.id, status: row.status, message: CONFIRMATION }, { status: 201 });
}, { name: "inspections", limit: 30 });
