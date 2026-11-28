import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import type { PiiAccessLevel } from "@/lib/rbac";

// ---------------------------------------------------------------------------
// PII Masking & Redaction Helpers
// ---------------------------------------------------------------------------

export function maskEmail(email: string | null | undefined, level: PiiAccessLevel): string {
  if (!email) return "—";
  if (level === "full") return email;
  if (level === "redacted") return "[REDACTED]";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.length <= 2 ? local[0] ?? "*" : `${local[0]}***${local[local.length - 1]}`;
  return `${visible}@${domain}`;
}

export function maskPhone(phone: string | null | undefined, level: PiiAccessLevel): string {
  if (!phone) return "—";
  if (level === "full") return phone;
  if (level === "redacted") return "[REDACTED]";
  const digits = phone.trim();
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

export function maskName(name: string | null | undefined, level: PiiAccessLevel): string {
  if (!name) return "—";
  if (level === "full") return name;
  if (level === "redacted") return "[REDACTED]";
  return name
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? "*" : `${part[0]}${"*".repeat(Math.min(part.length - 1, 4))}`))
    .join(" ");
}

export function maskIp(ip: string | null | undefined, level: PiiAccessLevel): string {
  if (!ip) return "—";
  if (level === "full") return ip;
  if (level === "redacted") return "[REDACTED]";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  return `${ip.slice(0, 6)}:***`;
}

// ---------------------------------------------------------------------------
// Privacy Settings
// ---------------------------------------------------------------------------

export async function getPrivacySettings() {
  const [existing] = await db
    .select()
    .from(schema.privacySettings)
    .where(eq(schema.privacySettings.key, "default"))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(schema.privacySettings)
    .values({ key: "default" })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [refetched] = await db
    .select()
    .from(schema.privacySettings)
    .where(eq(schema.privacySettings.key, "default"))
    .limit(1);
  return refetched;
}

// ---------------------------------------------------------------------------
// DSAR: Data Export (Right of Access / Portability)
// ---------------------------------------------------------------------------

export async function buildCustomerDataExport(customerId: string) {
  const [customer] = await db
    .select({
      id: schema.customers.id,
      fullName: schema.customers.fullName,
      email: schema.customers.email,
      phone: schema.customers.phone,
      emailVerified: schema.customers.emailVerified,
      phoneVerified: schema.customers.phoneVerified,
      idVerified: schema.customers.idVerified,
      isDiaspora: schema.customers.isDiaspora,
      country: schema.customers.country,
      source: schema.customers.source,
      createdAt: schema.customers.createdAt,
      lastActiveAt: schema.customers.lastActiveAt,
    })
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);

  if (!customer) return null;

  const [consents, inspections, reservations, transactions, payments, favorites, alerts, notifications] =
    await Promise.all([
      db.select().from(schema.privacyConsents).where(eq(schema.privacyConsents.customerId, customerId)),
      db.select().from(schema.inspections).where(eq(schema.inspections.customerId, customerId)),
      db.select().from(schema.reservations).where(eq(schema.reservations.customerId, customerId)),
      db.select().from(schema.transactions).where(eq(schema.transactions.customerId, customerId)),
      db.select().from(schema.payments).where(eq(schema.payments.customerId, customerId)),
      db.select().from(schema.favorites).where(eq(schema.favorites.customerId, customerId)),
      db.select().from(schema.alerts).where(eq(schema.alerts.customerId, customerId)),
      db.select().from(schema.notifications).where(eq(schema.notifications.customerId, customerId)),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    subject: customer,
    consents,
    inspections,
    reservations,
    transactions,
    payments,
    favorites,
    alerts,
    notifications,
  };
}

// ---------------------------------------------------------------------------
// DSAR: Right to Erasure / Cryptographic Anonymization
// ---------------------------------------------------------------------------

export async function executeCustomerErasure(
  customerId: string,
  actorStaffId: string,
  ip: string | null,
) {
  const [customer] = await db
    .select({ id: schema.customers.id, email: schema.customers.email })
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);

  if (!customer) return null;

  const shortId = customerId.slice(0, 8);
  const anonymizedEmail = `erased-${customerId}@anonymized.local`;
  const anonymizedName = `Anonymized User ${shortId}`;
  const now = new Date();

  await db.transaction(async (tx) => {
    // 1. Anonymize primary customer record and revoke all active sessions
    await tx
      .update(schema.customers)
      .set({
        fullName: anonymizedName,
        email: anonymizedEmail,
        phone: null,
        passwordHash: null,
        emailVerified: false,
        phoneVerified: false,
        idVerified: false,
        blocked: true,
        tokenVersion: sql`${schema.customers.tokenVersion} + 1`,
      })
      .where(eq(schema.customers.id, customerId));

    // 2. Anonymize linked sales leads & inspections PII while preserving financial/analytics integrity
    await tx
      .update(schema.leads)
      .set({ name: anonymizedName, email: anonymizedEmail, phone: null, updatedAt: now })
      .where(eq(schema.leads.customerId, customerId));

    await tx
      .update(schema.inspections)
      .set({ name: anonymizedName, email: anonymizedEmail, phone: "[ERASED]", updatedAt: now })
      .where(eq(schema.inspections.customerId, customerId));

    // 3. Revoke all privacy consents
    await tx
      .update(schema.privacyConsents)
      .set({ granted: false, revokedAt: now, updatedAt: now })
      .where(eq(schema.privacyConsents.customerId, customerId));

    // 4. Delete non-financial preferences (favorites, alerts, notifications)
    await tx.delete(schema.favorites).where(eq(schema.favorites.customerId, customerId));
    await tx.delete(schema.alerts).where(eq(schema.alerts.customerId, customerId));
    await tx.delete(schema.notifications).where(eq(schema.notifications.customerId, customerId));
  });

  await audit(
    { type: "staff", id: actorStaffId },
    "privacy.erasure.executed",
    {
      entity: "customer",
      entityId: customerId,
      meta: { anonymizedEmail },
      ip,
    },
  );

  return { customerId, anonymizedEmail, anonymizedName, executedAt: now.toISOString() };
}
