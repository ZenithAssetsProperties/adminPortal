import { schema } from "@/db";

// never select passwordHash / totpSecret
export const staffColumns = {
  id: schema.staff.id, name: schema.staff.name, email: schema.staff.email, phone: schema.staff.phone, role: schema.staff.role,
  active: schema.staff.active, totpEnabled: schema.staff.totpEnabled, lastLoginAt: schema.staff.lastLoginAt, createdAt: schema.staff.createdAt,
};
