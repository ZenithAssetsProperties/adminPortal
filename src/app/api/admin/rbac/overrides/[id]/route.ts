import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp } from "@/lib/http";

export const DELETE = adminRoute("rbac.manage", async ({ req, staff, params }) => {
  const [deleted] = await db
    .delete(schema.staffPermissionOverrides)
    .where(eq(schema.staffPermissionOverrides.id, params.id))
    .returning();

  if (!deleted) throw new ApiError(404, "Override not found");

  await audit(
    { type: "staff", id: staff.id },
    "rbac.override.revoke",
    {
      entity: "staff_permission_override",
      entityId: deleted.id,
      meta: { targetStaffId: deleted.staffId, permission: deleted.permission },
      ip: getIp(req),
    },
  );

  return { ok: true, id: deleted.id };
});
