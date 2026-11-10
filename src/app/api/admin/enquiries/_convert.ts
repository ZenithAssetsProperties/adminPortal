import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

type Enq = typeof schema.enquiries.$inferSelect;

/** Turns an enquiry into a lead (PRD §35: every enquiry becomes a lead) and links the two. */
export async function convertToLead(enq: Enq, agentId: string | null) {
  let customerId: string | null = null;
  if (enq.email) {
    const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.email, enq.email.toLowerCase()));
    customerId = c?.id ?? null;
  }
  const [lead] = await db.insert(schema.leads).values({
    name: enq.name, email: enq.email, phone: enq.phone, propertyId: enq.propertyId, customerId,
    source: enq.source || "website", agentId,
  }).returning();
  await db.update(schema.enquiries).set({ leadId: lead.id }).where(eq(schema.enquiries.id, enq.id));
  return lead;
}
