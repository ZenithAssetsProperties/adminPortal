import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "@/lib/http";
import { isScopedToOwn } from "@/lib/rbac";

export async function loadEnquiry(id: string, staff: { id: string; role: Parameters<typeof isScopedToOwn>[0] }) {
  const conds = [eq(schema.enquiries.id, id)];
  if (isScopedToOwn(staff.role)) {
    conds.push(inArray(schema.enquiries.leadId, db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.agentId, staff.id))));
  }
  const [row] = await db.select().from(schema.enquiries).where(and(...conds));
  if (!row) throw notFound();
  return row;
}
