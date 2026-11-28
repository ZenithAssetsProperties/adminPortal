export type Role = "super_admin" | "admin" | "sales_agent" | "finance" | "content";
export type PiiAccessLevel = "full" | "masked" | "redacted";

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
  "privacy.read", "privacy.manage",
  "rbac.read", "rbac.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: all,
  admin: all.filter((p) => !["staff.manage", "rbac.manage", "privacy.manage"].includes(p)),
  sales_agent: [
    "dashboard.view", "properties.read", "customers.read", "enquiries.read", "enquiries.write",
    "inspections.read", "inspections.write", "leads.read", "leads.write",
    "transactions.read",
  ],
  finance: [
    "dashboard.view", "customers.read", "transactions.read", "transactions.write",
    "payments.read", "payments.write", "reservations.read", "properties.read", "analytics.read",
  ],
  content: [
    "dashboard.view", "properties.read", "properties.write", "documents.read", "documents.write",
  ],
};

export const DEFAULT_ROLE_PII_LEVEL: Record<Role, PiiAccessLevel> = {
  super_admin: "full",
  admin: "full",
  sales_agent: "masked",
  finance: "masked",
  content: "redacted",
};

export const can = (role: Role, perm: Permission) => ROLE_PERMISSIONS[role]?.includes(perm) ?? false;

/** Roles whose data access is limited to records assigned to them. */
export const isScopedToOwn = (role: Role) => role === "sales_agent";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  sales_agent: "Sales agent",
  finance: "Finance",
  content: "Content",
};

export const PII_LEVEL_LABELS: Record<PiiAccessLevel, string> = {
  full: "Full (Cleartext)",
  masked: "Masked (Partial)",
  redacted: "Redacted (Hidden)",
};

export const PERMISSION_GROUPS: {
  group: string;
  items: { perm: Permission; label: string; description: string }[];
}[] = [
  {
    group: "Core & Analytics",
    items: [
      { perm: "dashboard.view", label: "View Dashboard", description: "Access executive KPIs and overview" },
      { perm: "analytics.read", label: "View Analytics", description: "View conversion funnels and export reports" },
      { perm: "audit.read", label: "Read Audit Log", description: "Inspect immutable system activity trail" },
    ],
  },
  {
    group: "Portfolio & Documents",
    items: [
      { perm: "properties.read", label: "Read Properties", description: "View property catalog and pricing" },
      { perm: "properties.write", label: "Write Properties", description: "Create and update property listings" },
      { perm: "properties.delete", label: "Delete Properties", description: "Soft-delete or archive listings" },
      { perm: "documents.read", label: "Read Documents", description: "View and download vault documents" },
      { perm: "documents.write", label: "Upload Documents", description: "Upload new document versions" },
      { perm: "documents.approve", label: "Approve Documents", description: "Approve, reject, or share documents" },
    ],
  },
  {
    group: "CRM & Sales Pipeline",
    items: [
      { perm: "customers.read", label: "Read Customers", description: "View customer profiles and activity" },
      { perm: "customers.write", label: "Manage Customers", description: "Edit or block customer accounts" },
      { perm: "enquiries.read", label: "Read Enquiries", description: "View inbound enquiries and callbacks" },
      { perm: "enquiries.write", label: "Handle Enquiries", description: "Convert enquiries into leads" },
      { perm: "inspections.read", label: "Read Inspections", description: "View scheduled property inspections" },
      { perm: "inspections.write", label: "Manage Inspections", description: "Confirm, assign, or complete inspections" },
      { perm: "leads.read", label: "Read Leads", description: "View sales leads and pipeline stages" },
      { perm: "leads.write", label: "Manage Leads", description: "Update lead stages, notes, and agents" },
      { perm: "agents.read", label: "Read Agents", description: "View sales agent performance" },
      { perm: "agents.write", label: "Assign Agents", description: "Assign leads and properties to agents" },
    ],
  },
  {
    group: "Finance & Reservations",
    items: [
      { perm: "reservations.read", label: "Read Reservations", description: "View active and expired holds" },
      { perm: "reservations.write", label: "Manage Reservations", description: "Cancel or convert reservations" },
      { perm: "transactions.read", label: "Read Transactions", description: "View deal pipelines and milestones" },
      { perm: "transactions.write", label: "Manage Transactions", description: "Advance transaction stages" },
      { perm: "payments.read", label: "Read Payments", description: "View payment ledger and receipts" },
      { perm: "payments.write", label: "Record Payments", description: "Record manual payments and verify" },
    ],
  },
  {
    group: "Governance, Privacy & RBAC",
    items: [
      { perm: "staff.manage", label: "Manage Staff", description: "Create staff accounts, reset passwords, deactivate" },
      { perm: "rbac.read", label: "Read RBAC Policies", description: "View role permission matrices and overrides" },
      { perm: "rbac.manage", label: "Manage RBAC Policies", description: "Modify role permissions and grant JIT overrides" },
      { perm: "privacy.read", label: "Read Privacy & DSAR", description: "View consent ledgers, retention, and DSAR queue" },
      { perm: "privacy.manage", label: "Execute Privacy Actions", description: "Approve DSARs, export data, and anonymize PII" },
    ],
  },
];
