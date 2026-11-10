import { schema } from "@/db";

// never select passwordHash
export const staffColumns = {
  id: schema.staff.id, name: schema.staff.name, email: schema.staff.email, phone: schema.staff.phone, role: schema.staff.role,
  active: schema.staff.active, lastLoginAt: schema.staff.lastLoginAt, createdAt: schema.staff.createdAt,
};
