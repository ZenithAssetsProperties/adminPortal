import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp, parseBody } from "@/lib/http";
import { PERMISSIONS } from "@/lib/rbac";

const VALID_PERMS = new Set<string>(PERMISSIONS);

const CreateOverride = z.object({
  staffId: z.string().uuid(),
  permission: z.string().min(3).max(80),
  effect: z.enum(["allow", "deny"]),
  reason: z.string().trim().min(3).max(300),
  expiresAt: z.string().datetime().nullish(),
});

export const POST = adminRoute("rbac.manage", async ({ req, staff }) => {
  const body = await parseBody(req, CreateOverride);
  if (!VALID_PERMS.has(body.permission)) {
    throw new ApiError(400, "Unknown permission identifier");
  }

  const [targetStaff] = await db
    .select({ id: schema.staff.id, role: schema.staff.role, name: schema.staff.name })
    .from(schema.staff)
    .where(eq(schema.staff.id, body.staffId))
    .limit(1);

  if (!targetStaff) throw new ApiError(404, "Staff member not found");

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    throw new ApiError(400, "Expiration time must be in the future");
  }

  const [row] = await db
    .insert(schema.staffPermissionOverrides)
    .values({
      staffId: body.staffId,
      permission: body.permission,
      effect: body.effect,
      reason: body.reason,
      expiresAt,
      grantedBy: staff.id,
    })
    .onConflictDoUpdate({
      target: [schema.staffPermissionOverrides.staffId, schema.staffPermissionOverrides.permission],
      set: {
        effect: body.effect,
        reason: body.reason,
        expiresAt,
        grantedBy: staff.id,
      },
    })
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "rbac.override.grant",
    {
      entity: "staff_permission_override",
      entityId: row.id,
      meta: {
        targetStaffId: body.staffId,
        permission: body.permission,
        effect: body.effect,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
      ip: getIp(req),
    },
  );

  return Response.json(row, { status: 201 });
});
