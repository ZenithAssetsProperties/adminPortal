import { and, count, desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminRoute } from "@/lib/http";
import { getPrivacySettings, maskIp } from "@/lib/privacy";

export const GET = adminRoute("privacy.read", async ({ staff }) => {
  const now = new Date();
  const [
    settings,
    [{ openDsars }],
    [{ overdueDsars }],
    [{ completedDsars }],
    [{ totalConsents }],
    [{ grantedConsents }],
    [{ activeOverrides }],
    [{ customPolicies }],
    recentPrivacyAudit,
  ] = await Promise.all([
    getPrivacySettings(),
    db
      .select({ openDsars: count() })
      .from(schema.privacyRequests)
      .where(inArray(schema.privacyRequests.status, ["pending", "in_review", "approved"])),
    db
      .select({ overdueDsars: count() })
      .from(schema.privacyRequests)
      .where(
        and(
          inArray(schema.privacyRequests.status, ["pending", "in_review", "approved"]),
          lt(schema.privacyRequests.dueAt, now),
        ),
      ),
    db
      .select({ completedDsars: count() })
      .from(schema.privacyRequests)
      .where(eq(schema.privacyRequests.status, "completed")),
    db.select({ totalConsents: count() }).from(schema.privacyConsents),
    db
      .select({ grantedConsents: count() })
      .from(schema.privacyConsents)
      .where(eq(schema.privacyConsents.granted, true)),
    db.select({ activeOverrides: count() }).from(schema.staffPermissionOverrides),
    db.select({ customPolicies: count() }).from(schema.rolePolicies),
    db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        entity: schema.auditLogs.entity,
        entityId: schema.auditLogs.entityId,
        meta: schema.auditLogs.meta,
        ip: schema.auditLogs.ip,
        createdAt: schema.auditLogs.createdAt,
        actorName: schema.staff.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.auditLogs.actorId))
      .where(or(ilike(schema.auditLogs.action, "privacy.%"), ilike(schema.auditLogs.action, "rbac.%")))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(12),
  ]);

  // Calculate compliance posture score (out of 100)
  let score = 70;
  if (settings.maskPiiByDefault) score += 10;
  if (settings.anonymizeOnErasure) score += 10;
  if (Number(overdueDsars) === 0) score += 10;

  const piiLevel = staff.piiAccessLevel ?? "full";

  return {
    postureScore: Math.min(100, score),
    metrics: {
      openDsars: Number(openDsars),
      overdueDsars: Number(overdueDsars),
      completedDsars: Number(completedDsars),
      totalConsents: Number(totalConsents),
      grantedConsents: Number(grantedConsents),
      consentRate: Number(totalConsents) > 0 ? Math.round((Number(grantedConsents) / Number(totalConsents)) * 100) : 100,
      activeOverrides: Number(activeOverrides),
      customPolicies: Number(customPolicies),
    },
    settings,
    recentAudit: recentPrivacyAudit.map((row) => ({
      ...row,
      ip: row.ip ? maskIp(row.ip, piiLevel) : null,
    })),
  };
});
