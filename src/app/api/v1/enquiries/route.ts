import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getIp, parseBody, preflight, publicRoute } from "@/lib/http";
import { notifyStaff } from "@/lib/notify";
import { optionalCustomer } from "@/lib/customer-auth";
import { rateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/lib/http";

const Body = z.object({
  kind: z.enum(["enquiry", "callback", "consultation", "property_request", "whatsapp"]).default("enquiry"),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  message: z.string().trim().max(3000).optional(),
  propertySlug: z.string().trim().max(200).optional(),
  source: z.string().trim().max(80).optional(), // e.g. instagram, google, referral
  utm: z.record(z.string().max(40), z.string().max(120)).optional(),
  website: z.string().max(200).optional(), // honeypot: real people leave this empty
}).refine((b) => b.email || b.phone, { message: "Give an email or a phone number so we can reach you", path: ["email"] });

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const b = await parseBody(req, Body);
  // bots fill the hidden field. Pretend success so they learn nothing, but store nothing.
  if (b.website) return { ok: true };
  if (!(await rateLimit(`enq:${getIp(req) ?? "?"}`, 10, 3600))) throw new ApiError(429, "Too many requests, please try again later");

  const customer = await optionalCustomer(req);
  let property: typeof schema.properties.$inferSelect | undefined;
  if (b.propertySlug) {
    [property] = await db.select().from(schema.properties).where(and(eq(schema.properties.slug, b.propertySlug), isNull(schema.properties.deletedAt)));
  }
  const source = b.source ?? b.utm?.utm_source ?? "website";

  const { enquiry, lead } = await db.transaction(async (tx) => {
    const [lead] = await tx.insert(schema.leads).values({
      customerId: customer?.id, name: b.name, email: b.email ?? customer?.email, phone: b.phone, propertyId: property?.id,
      source, agentId: property?.agentId ?? null,
    }).returning();
    const [enquiry] = await tx.insert(schema.enquiries).values({
      kind: b.kind, name: b.name, email: b.email, phone: b.phone, message: b.message, propertyId: property?.id, leadId: lead.id, source,
    }).returning();
    return { enquiry, lead };
  });
  await notifyStaff(property?.agentId, {
    type: "new_enquiry", title: `New ${b.kind.replace("_", " ")}`,
    body: `${b.name}${property ? ` is interested in ${property.name}` : " sent an enquiry"}.`,
  });
  return Response.json({ ok: true, enquiryId: enquiry.id, leadId: lead.id, message: "Thanks, a Zenith Asset Group consultant will be in touch." }, { status: 201 });
}, { name: "enquiries", limit: 30 });
