import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { customerRoute, getIp, parseBody, preflight } from "@/lib/http";
import { getPrivacySettings } from "@/lib/privacy";

export const OPTIONS = preflight;

export const GET = customerRoute(
  async ({ customer }) => {
    const [items, settings] = await Promise.all([
      db
        .select({
          purpose: schema.privacyConsents.purpose,
          granted: schema.privacyConsents.granted,
          policyVersion: schema.privacyConsents.policyVersion,
          grantedAt: schema.privacyConsents.grantedAt,
          revokedAt: schema.privacyConsents.revokedAt,
          updatedAt: schema.privacyConsents.updatedAt,
        })
        .from(schema.privacyConsents)
        .where(eq(schema.privacyConsents.customerId, customer.id)),
      getPrivacySettings(),
    ]);
    return { policyVersion: settings.policyVersion, items };
  },
  { limit: 60, name: "v1-privacy-consents-get" },
);

const UpdateConsents = z.object({
  consents: z
    .array(
      z.object({
        purpose: z.enum(["marketing", "analytics", "kyc_processing", "third_party_sharing", "communications"]),
        granted: z.boolean(),
      }),
    )
    .min(1)
    .max(5),
});

export const PUT = customerRoute(
  async ({ req, customer }) => {
    const body = await parseBody(req, UpdateConsents);
    const settings = await getPrivacySettings();
    const now = new Date();
    const ip = getIp(req);

    const results = [];
    for (const item of body.consents) {
      const [saved] = await db
        .insert(schema.privacyConsents)
        .values({
          customerId: customer.id,
          purpose: item.purpose,
          granted: item.granted,
          policyVersion: settings.policyVersion,
          source: "customer_portal",
          ip,
          grantedAt: item.granted ? now : null,
          revokedAt: item.granted ? null : now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.privacyConsents.customerId, schema.privacyConsents.purpose],
          set: {
            granted: item.granted,
            policyVersion: settings.policyVersion,
            source: "customer_portal",
            ip,
            ...(item.granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }),
            updatedAt: now,
          },
        })
        .returning();
      results.push(saved);
    }

    await audit(
      { type: "customer", id: customer.id },
      "privacy.consent.customer_update",
      {
        entity: "customer",
        entityId: customer.id,
        meta: { purposes: body.consents.map((c) => `${c.purpose}:${c.granted}`) },
        ip,
      },
    );

    return { policyVersion: settings.policyVersion, items: results };
  },
  { limit: 20, name: "v1-privacy-consents-put" },
);
