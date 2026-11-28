import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  DEFAULT_ROLE_PII_LEVEL,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Permission,
  type PiiAccessLevel,
  type Role,
} from "@/lib/rbac";

export type ResolvedStaffAccess = {
  permissions: Permission[];
  piiAccessLevel: PiiAccessLevel;
  sessionTtlMinutes: number;
  requireMfa: boolean;
  allowedIpCidrs: string[];
  overrideCount: number;
};

const VALID_PERMS = new Set<string>(PERMISSIONS);

/**
 * Resolves effective permissions and privacy policy for a staff member by combining:
 * 1. Database `role_policies` (or static `ROLE_PERMISSIONS` fallback)
 * 2. Active, non-expired `staff_permission_overrides` (allow / deny)
 */
export async function resolveStaffAccess(staffId: string, role: Role): Promise<ResolvedStaffAccess> {
  const now = new Date();
  const [policyRows, overrideRows] = await Promise.all([
    db.select().from(schema.rolePolicies).where(eq(schema.rolePolicies.role, role)).limit(1),
    db
      .select()
      .from(schema.staffPermissionOverrides)
      .where(
        and(
          eq(schema.staffPermissionOverrides.staffId, staffId),
          or(isNull(schema.staffPermissionOverrides.expiresAt), gt(schema.staffPermissionOverrides.expiresAt, now)),
        ),
      ),
  ]);

  const policy = policyRows[0];
  const basePerms: Permission[] = policy
    ? (policy.permissions.filter((p): p is Permission => VALID_PERMS.has(p)))
    : [...(ROLE_PERMISSIONS[role] ?? [])];

  const permSet = new Set<Permission>(basePerms);

  for (const ov of overrideRows) {
    if (!VALID_PERMS.has(ov.permission)) continue;
    const p = ov.permission as Permission;
    if (ov.effect === "allow") permSet.add(p);
    else if (ov.effect === "deny") permSet.delete(p);
  }

  // Safeguard: super_admin always retains governance recovery permissions
  if (role === "super_admin") {
    permSet.add("staff.manage");
    permSet.add("rbac.read");
    permSet.add("rbac.manage");
    permSet.add("privacy.read");
    permSet.add("privacy.manage");
  }

  return {
    permissions: Array.from(permSet),
    piiAccessLevel: policy?.piiAccessLevel ?? DEFAULT_ROLE_PII_LEVEL[role],
    sessionTtlMinutes: policy?.sessionTtlMinutes ?? 30,
    requireMfa: policy?.requireMfa ?? false,
    allowedIpCidrs: policy?.allowedIpCidrs ?? [],
    overrideCount: overrideRows.length,
  };
}

export async function hasStaffPermission(staffId: string, role: Role, perm: Permission): Promise<boolean> {
  const access = await resolveStaffAccess(staffId, role);
  return access.permissions.includes(perm);
}
