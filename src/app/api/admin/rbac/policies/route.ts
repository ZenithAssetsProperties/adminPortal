import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminRoute } from "@/lib/http";
import {
  DEFAULT_ROLE_PII_LEVEL,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Role,
} from "@/lib/rbac";

const ROLES: Role[] = ["super_admin", "admin", "sales_agent", "finance", "content"];

export const GET = adminRoute("rbac.read", async () => {
  const [dbPolicies, overrides, staffList] = await Promise.all([
    db.select().from(schema.rolePolicies),
    db
      .select({
        id: schema.staffPermissionOverrides.id,
        staffId: schema.staffPermissionOverrides.staffId,
        staffName: schema.staff.name,
        staffEmail: schema.staff.email,
        staffRole: schema.staff.role,
        permission: schema.staffPermissionOverrides.permission,
        effect: schema.staffPermissionOverrides.effect,
        reason: schema.staffPermissionOverrides.reason,
        expiresAt: schema.staffPermissionOverrides.expiresAt,
        createdAt: schema.staffPermissionOverrides.createdAt,
      })
      .from(schema.staffPermissionOverrides)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.staffPermissionOverrides.staffId))
      .orderBy(desc(schema.staffPermissionOverrides.createdAt)),
    db
      .select({
        id: schema.staff.id,
        name: schema.staff.name,
        email: schema.staff.email,
        role: schema.staff.role,
        active: schema.staff.active,
      })
      .from(schema.staff)
      .orderBy(asc(schema.staff.name)),
  ]);

  const policyMap = new Map(dbPolicies.map((p) => [p.role, p]));

  const policies = ROLES.map((role) => {
    const custom = policyMap.get(role);
    return {
      role,
      label: ROLE_LABELS[role],
      permissions: custom ? custom.permissions : ROLE_PERMISSIONS[role],
      piiAccessLevel: custom?.piiAccessLevel ?? DEFAULT_ROLE_PII_LEVEL[role],
      requireMfa: custom?.requireMfa ?? false,
      sessionTtlMinutes: custom?.sessionTtlMinutes ?? 30,
      allowedIpCidrs: custom?.allowedIpCidrs ?? [],
      description: custom?.description ?? null,
      customized: Boolean(custom),
      updatedAt: custom?.updatedAt ?? null,
    };
  });

  return {
    policies,
    permissionGroups: PERMISSION_GROUPS,
    overrides,
    staffList,
  };
});
