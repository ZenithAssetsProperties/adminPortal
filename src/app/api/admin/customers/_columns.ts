import { sql } from "drizzle-orm";
import { schema } from "@/db";
import { isScopedToOwn, type Role } from "@/lib/rbac";

// Explicit column list so passwordHash can never leak.
export const customerColumns = {
  id: schema.customers.id, fullName: schema.customers.fullName, email: schema.customers.email, phone: schema.customers.phone,
  emailVerified: schema.customers.emailVerified, phoneVerified: schema.customers.phoneVerified, idVerified: schema.customers.idVerified,
  isDiaspora: schema.customers.isDiaspora, country: schema.customers.country, source: schema.customers.source,
  blocked: schema.customers.blocked, createdAt: schema.customers.createdAt, lastActiveAt: schema.customers.lastActiveAt,
};

/** Sales agents may only see customers tied to a lead or transaction assigned to them. Others see everyone. */
export function customerScope(staff: { id: string; role: Role }) {
  if (!isScopedToOwn(staff.role)) return undefined;
  return sql`(exists (select 1 from leads l where l.customer_id = ${schema.customers.id} and l.agent_id = ${staff.id})
    or exists (select 1 from transactions t where t.customer_id = ${schema.customers.id} and t.agent_id = ${staff.id}))`;
}
