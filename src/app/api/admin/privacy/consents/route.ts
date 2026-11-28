import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp, parseBody, parseQuery } from "@/lib/http";
import { getPrivacySettings, maskEmail, maskName } from "@/lib/privacy";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";

const Q = PageQuery.extend({
  purpose: z.enum(["marketing", "analytics", "kyc_processing", "third_party_sharing", "communications"]).optional(),
  granted: z.enum(["1", "0"]).optional(),
});

export const GET = adminRoute("privacy.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const c = schema.privacyConsents;
  const conds: (SQL | undefined)[] = [];
  if (q.purpose) conds.push(eq(c.purpose, q.purpose));
  if (q.granted) conds.push(eq(c.granted, q.granted === "1"));
  if (q.q) {
    const l = likeEscape(q.q);
    conds.push(or(ilike(schema.customers.fullName, l), ilike(schema.customers.email, l)));
  }
  const where = and(...conds);

  const [items, [{ n }]] = await Promise.all([
    db
      .select({
        id: c.id,
        customerId: c.customerId,
        customerName: schema.customers.fullName,
        customerEmail: schema.customers.email,
        purpose: c.purpose,
        granted: c.granted,
        policyVersion: c.policyVersion,
        source: c.source,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
        updatedAt: c.updatedAt,
      })
      .from(c)
      .innerJoin(schema.customers, eq(schema.customers.id, c.customerId))
      .where(where)
      .orderBy(desc(c.updatedAt))
      .limit(q.pageSize)
      .offset(offset(q)),
    db
      .select({ n: count() })
      .from(c)
      .innerJoin(schema.customers, eq(schema.customers.id, c.customerId))
      .where(where),
  ]);

  const piiLevel = staff.piiAccessLevel ?? "full";
  const masked = items.map((row) => ({
    ...row,
    customerName: maskName(row.customerName, piiLevel),
    customerEmail: maskEmail(row.customerEmail, piiLevel),
  }));

  return paged(masked, Number(n), q);
});

const UpsertConsent = z.object({
  customerId: z.string().uuid(),
  purpose: z.enum(["marketing", "analytics", "kyc_processing", "third_party_sharing", "communications"]),
  granted: z.boolean(),
});

export const POST = adminRoute("privacy.manage", async ({ req, staff }) => {
  const body = await parseBody(req, UpsertConsent);
  const [customer] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.id, body.customerId))
    .limit(1);
  if (!customer) throw new ApiError(404, "Customer not found");

  const settings = await getPrivacySettings();
  const now = new Date();
  const ip = getIp(req);

  const [saved] = await db
    .insert(schema.privacyConsents)
    .values({
      customerId: body.customerId,
      purpose: body.purpose,
      granted: body.granted,
      policyVersion: settings.policyVersion,
      source: "admin_portal",
      ip,
      grantedAt: body.granted ? now : null,
      revokedAt: body.granted ? null : now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.privacyConsents.customerId, schema.privacyConsents.purpose],
      set: {
        granted: body.granted,
        policyVersion: settings.policyVersion,
        source: "admin_portal",
        ip,
        ...(body.granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }),
        updatedAt: now,
      },
    })
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "privacy.consent.update",
    {
      entity: "privacy_consent",
      entityId: saved.id,
      meta: { customerId: body.customerId, purpose: body.purpose, granted: body.granted },
      ip,
    },
  );

  return saved;
});
