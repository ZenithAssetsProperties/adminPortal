export type Role = "super_admin" | "admin" | "sales_agent" | "finance" | "content";

export const PERMISSIONS = [
  "dashboard.view",
  "properties.read", "properties.write", "properties.delete",
  "documents.read", "documents.write", "documents.approve",
  "customers.read", "customers.write",
  "enquiries.read", "enquiries.write",
  "inspections.read", "inspections.write",
  "leads.read", "leads.write",
  "transactions.read", "transactions.write",
  "payments.read", "payments.write",
  "reservations.read", "reservations.write",
  "agents.read", "agents.write",
  "analytics.read",
  "audit.read",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: all,
  admin: all.filter((p) => p !== "staff.manage"),
  sales_agent: [
    "dashboard.view", "properties.read", "customers.read", "enquiries.read", "enquiries.write",
    "inspections.read", "inspections.write", "leads.read", "leads.write", "reservations.read",
    "transactions.read", "documents.read",
  ],
  finance: [
    "dashboard.view", "customers.read", "transactions.read", "transactions.write",
    "payments.read", "payments.write", "reservations.read", "properties.read", "analytics.read",
  ],
  content: [
    "dashboard.view", "properties.read", "properties.write", "documents.read", "documents.write",
  ],
};

export const can = (role: Role, perm: Permission) => ROLE_PERMISSIONS[role]?.includes(perm) ?? false;

/** Roles whose data access is limited to records assigned to them. */
export const isScopedToOwn = (role: Role) => role === "sales_agent";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin", admin: "Admin", sales_agent: "Sales agent", finance: "Finance", content: "Content",
};
