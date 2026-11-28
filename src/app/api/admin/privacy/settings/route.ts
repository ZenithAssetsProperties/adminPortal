import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { adminRoute, getIp, parseBody } from "@/lib/http";
import { getPrivacySettings } from "@/lib/privacy";

export const GET = adminRoute("privacy.read", async () => {
  return getPrivacySettings();
});

const UpdateSettings = z.object({
  auditLogRetentionDays: z.number().int().min(30).max(3650).optional(),
  inactiveCustomerRetentionDays: z.number().int().min(90).max(3650).optional(),
  dsarSlaDays: z.number().int().min(5).max(90).optional(),
  maskPiiByDefault: z.boolean().optional(),
  enforceIpAllowlist: z.boolean().optional(),
  anonymizeOnErasure: z.boolean().optional(),
  policyVersion: z.string().trim().min(1).max(32).optional(),
});

export const PATCH = adminRoute("privacy.manage", async ({ req, staff }) => {
  const body = await parseBody(req, UpdateSettings);
  const current = await getPrivacySettings();
  const [updated] = await db
    .update(schema.privacySettings)
    .set({
      ...body,
      updatedBy: staff.id,
      updatedAt: new Date(),
    })
    .where(eq(schema.privacySettings.id, current.id))
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "privacy.settings.update",
    {
      entity: "privacy_settings",
      entityId: updated.id,
      meta: body,
      ip: getIp(req),
    },
  );

  return updated;
});
