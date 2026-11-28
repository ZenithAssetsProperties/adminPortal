import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp, parseBody } from "@/lib/http";
import { PERMISSIONS, type Role } from "@/lib/rbac";

const VALID_ROLES = new Set<Role>(["super_admin", "admin", "sales_agent", "finance", "content"]);
const VALID_PERMS = new Set<string>(PERMISSIONS);

const UpdatePolicy = z.object({
  permissions: z.array(z.string()).max(100),
  piiAccessLevel: z.enum(["full", "masked", "redacted"]),
  requireMfa: z.boolean().optional(),
  sessionTtlMinutes: z.number().int().min(5).max(1440).optional(),
  allowedIpCidrs: z.array(z.string().trim().max(64)).max(50).optional(),
  description: z.string().trim().max(500).nullish(),
});

export const PATCH = adminRoute("rbac.manage", async ({ req, staff, params }) => {
  const roleParam = params.role as Role;
  if (!VALID_ROLES.has(roleParam)) throw new ApiError(400, "Invalid role");

  const body = await parseBody(req, UpdatePolicy);
  const filteredPerms = Array.from(new Set(body.permissions.filter((p) => VALID_PERMS.has(p))));

  // Prevent locking super_admin out of governance recovery controls
  if (roleParam === "super_admin") {
    for (const essential of ["staff.manage", "rbac.read", "rbac.manage", "privacy.read", "privacy.manage"]) {
      if (!filteredPerms.includes(essential)) filteredPerms.push(essential);
    }
  }

  const now = new Date();
  const [saved] = await db
    .insert(schema.rolePolicies)
    .values({
      role: roleParam,
      permissions: filteredPerms,
      piiAccessLevel: body.piiAccessLevel,
      requireMfa: body.requireMfa ?? false,
      sessionTtlMinutes: body.sessionTtlMinutes ?? 30,
      allowedIpCidrs: body.allowedIpCidrs ?? [],
      description: body.description ?? null,
      updatedBy: staff.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.rolePolicies.role,
      set: {
        permissions: filteredPerms,
        piiAccessLevel: body.piiAccessLevel,
        requireMfa: body.requireMfa ?? false,
        sessionTtlMinutes: body.sessionTtlMinutes ?? 30,
        allowedIpCidrs: body.allowedIpCidrs ?? [],
        description: body.description ?? null,
        updatedBy: staff.id,
        updatedAt: now,
      },
    })
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "rbac.policy.update",
    {
      entity: "role_policy",
      entityId: roleParam,
      meta: {
        permissionCount: filteredPerms.length,
        piiAccessLevel: body.piiAccessLevel,
        sessionTtlMinutes: saved.sessionTtlMinutes,
      },
      ip: getIp(req),
    },
  );

  return saved;
});
