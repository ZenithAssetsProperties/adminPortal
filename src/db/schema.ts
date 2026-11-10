import {
  pgTable, pgEnum, uuid, text, integer, bigint, boolean, timestamp, jsonb, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- enums ----------
export const staffRole = pgEnum("staff_role", ["super_admin", "admin", "sales_agent", "finance", "content"]);
export const propertyType = pgEnum("property_type", ["land", "house", "apartment", "commercial"]);
export const propertyPurpose = pgEnum("property_purpose", ["buy", "invest", "rent"]);
export const propertyStatus = pgEnum("property_status", ["draft", "available", "reserved", "sold"]);
export const mediaKind = pgEnum("media_kind", ["photo", "video", "floorplan", "siteplan", "drone", "tour360"]);
export const docKind = pgEnum("doc_kind", [
  "survey_plan", "deed_of_assignment", "certificate_of_occupancy", "governors_consent", "allocation_letter",
  "building_approval", "approved_building_plan", "title_document", "development_approval",
  "receipt", "purchase_agreement", "correspondence", "other",
]);
export const docStatus = pgEnum("doc_status", ["pending", "approved", "rejected"]);
export const docVisibility = pgEnum("doc_visibility", ["request_only", "customer_only", "public"]);
export const accessStatus = pgEnum("access_status", ["pending", "approved", "denied"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "inspection_scheduled", "negotiation", "purchased", "lost"]);
export const enquiryKind = pgEnum("enquiry_kind", ["enquiry", "callback", "consultation", "property_request", "whatsapp"]);
export const inspectionKind = pgEnum("inspection_kind", ["physical", "virtual"]);
export const inspectionStatus = pgEnum("inspection_status", ["requested", "confirmed", "completed", "cancelled"]);
export const reservationStatus = pgEnum("reservation_status", ["pending", "active", "expired", "cancelled", "converted"]);
export const txStage = pgEnum("tx_stage", [
  "property_selected", "inspection_completed", "reservation_confirmed", "payment_received",
  "documentation_processing", "ownership_completed", "cancelled",
]);
export const paymentKind = pgEnum("payment_kind", ["reservation", "deposit", "installment", "balance", "full"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "success", "failed", "abandoned"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });

// ---------- people ----------
export const staff = pgTable("staff", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: staffRole("role").notNull().default("sales_agent"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
  // bump to sign everyone out (password change, deactivation)
  tokenVersion: integer("token_version").notNull().default(0),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const customers = pgTable("customers", {
  id: id(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  idVerified: boolean("id_verified").notNull().default(false),
  isDiaspora: boolean("is_diaspora").notNull().default(false),
  country: text("country"),
  source: text("source"),
  blocked: boolean("blocked").notNull().default(false),
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: createdAt(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});

// ---------- properties ----------
export const properties = pgTable("properties", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  type: propertyType("type").notNull(),
  purpose: propertyPurpose("purpose").notNull().default("buy"),
  status: propertyStatus("status").notNull().default("draft"),
  state: text("state").notNull(),
  city: text("city").notNull(),
  area: text("area"),
  // exact coordinates are staff-only; the public API only returns the general area
  latitude: text("latitude"),
  longitude: text("longitude"),
  priceKobo: money("price_kobo").notNull(),
  sizeSqm: integer("size_sqm"),
  landSizeSqm: integer("land_size_sqm"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  parking: integer("parking"),
  developmentStatus: text("development_status"),
  description: text("description"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  nearby: jsonb("nearby").$type<{ category: string; name: string; distance?: string }[]>().notNull().default([]),
  investment: jsonb("investment").$type<{
    rentalPotential?: string; appreciation?: string; developmentPlans?: string;
    estimatedCosts?: string; risks?: string; horizon?: string;
  } | null>(),
  verified: boolean("verified").notNull().default(false),
  verificationNotes: text("verification_notes"),
  paymentPlanAvailable: boolean("payment_plan_available").notNull().default(false),
  minDepositPercent: integer("min_deposit_percent").notNull().default(30),
  maxPlanMonths: integer("max_plan_months").notNull().default(12),
  reservationFeeKobo: money("reservation_fee_kobo").notNull().default(0),
  reservationDays: integer("reservation_days").notNull().default(7),
  featured: boolean("featured").notNull().default(false),
  priceReduced: boolean("price_reduced").notNull().default(false),
  limitedAvailability: boolean("limited_availability").notNull().default(false),
  agentId: uuid("agent_id").references(() => staff.id, { onDelete: "set null" }),
  coverImage: text("cover_image"),
  createdBy: uuid("created_by").references(() => staff.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("properties_status_idx").on(t.status), index("properties_city_idx").on(t.city)]);

export const propertyMedia = pgTable("property_media", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  kind: mediaKind("kind").notNull().default("photo"),
  // storage key for uploads, or a full URL for external media (YouTube, 360 tour)
  storageKey: text("storage_key"),
  url: text("url"),
  caption: text("caption"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
});

// ---------- documents ----------
export const documents = pgTable("documents", {
  id: id(),
  // all versions of the same document share a groupId; the highest version is current
  groupId: uuid("group_id").notNull(),
  version: integer("version").notNull().default(1),
  kind: docKind("kind").notNull().default("other"),
  title: text("title").notNull(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: docStatus("status").notNull().default("pending"),
  visibility: docVisibility("visibility").notNull().default("request_only"),
  uploadedBy: uuid("uploaded_by").references(() => staff.id, { onDelete: "set null" }),
  approvedBy: uuid("approved_by").references(() => staff.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("documents_group_idx").on(t.groupId), index("documents_customer_idx").on(t.customerId)]);

export const documentAccess = pgTable("document_access", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  status: accessStatus("status").notNull().default("pending"),
  decidedBy: uuid("decided_by").references(() => staff.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("doc_access_unique").on(t.documentId, t.customerId)]);

// ---------- sales pipeline ----------
export const leads = pgTable("leads", {
  id: id(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
  source: text("source").notNull().default("website"),
  status: leadStatus("status").notNull().default("new"),
  agentId: uuid("agent_id").references(() => staff.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("leads_status_idx").on(t.status), index("leads_agent_idx").on(t.agentId)]);

export const leadNotes = pgTable("lead_notes", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const enquiries = pgTable("enquiries", {
  id: id(),
  kind: enquiryKind("kind").notNull().default("enquiry"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  message: text("message"),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  source: text("source"),
  handled: boolean("handled").notNull().default(false),
  createdAt: createdAt(),
});

export const inspections = pgTable("inspections", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  kind: inspectionKind("kind").notNull().default("physical"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  preferredDate: date("preferred_date").notNull(),
  preferredTime: text("preferred_time").notNull(),
  visitors: integer("visitors").notNull().default(1),
  specialRequest: text("special_request"),
  status: inspectionStatus("status").notNull().default("requested"),
  assignedTo: uuid("assigned_to").references(() => staff.id, { onDelete: "set null" }),
  staffNote: text("staff_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- money ----------
export const reservations = pgTable("reservations", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  status: reservationStatus("status").notNull().default("pending"),
  amountKobo: money("amount_kobo").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const transactions = pgTable("transactions", {
  id: id(),
  reference: text("reference").notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "restrict" }),
  priceKobo: money("price_kobo").notNull(),
  stage: txStage("stage").notNull().default("property_selected"),
  planMonths: integer("plan_months"),
  depositPercent: integer("deposit_percent"),
  agentId: uuid("agent_id").references(() => staff.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("tx_customer_idx").on(t.customerId)]);

export const transactionEvents = pgTable("transaction_events", {
  id: id(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  stage: txStage("stage").notNull(),
  note: text("note"),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const payments = pgTable("payments", {
  id: id(),
  reference: text("reference").notNull().unique(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  kind: paymentKind("kind").notNull(),
  amountKobo: money("amount_kobo").notNull(),
  method: text("method"),
  status: paymentStatus("status").notNull().default("pending"),
  gatewayRef: text("gateway_ref"),
  recordedBy: uuid("recorded_by").references(() => staff.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("payments_tx_idx").on(t.transactionId)]);

export const receipts = pgTable("receipts", {
  id: id(),
  number: text("number").notNull().unique(),
  paymentId: uuid("payment_id").notNull().unique().references(() => payments.id, { onDelete: "cascade" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- customer extras (used by the main site through the API) ----------
export const favorites = pgTable("favorites", {
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("favorites_unique").on(t.customerId, t.propertyId)]);

export const alerts = pgTable("alerts", {
  id: id(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  criteria: jsonb("criteria").$type<{
    city?: string; state?: string; type?: string; minBedrooms?: number; maxPriceKobo?: number;
  }>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const messageLog = pgTable("message_log", {
  id: id(),
  channel: text("channel").notNull(), // email | sms | whatsapp
  recipient: text("recipient").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"), // queued | sent | failed
  error: text("error"),
  createdAt: createdAt(),
});

// ---------- governance & analytics ----------
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorType: text("actor_type").notNull(), // staff | customer | system
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt)]);

export const analyticsEvents = pgTable("analytics_events", {
  id: id(),
  type: text("type").notNull(), // visit | property_view | search | tour_view | doc_view | payment_started | ...
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  sessionId: text("session_id"),
  source: text("source"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, (t) => [index("analytics_type_idx").on(t.type, t.createdAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
