import { adminRoute } from "@/lib/http";
import { resolveStaffAccess } from "@/lib/rbac-server";

// Also used by the browser as a keep-alive ping (see adminRoute: refreshes the cookie).
export const GET = adminRoute(null, async ({ staff }) => {
  const access = await resolveStaffAccess(staff.id, staff.role);
  return {
    staff,
    permissions: access.permissions,
    piiAccessLevel: access.piiAccessLevel,
    sessionTtlMinutes: access.sessionTtlMinutes,
    requireMfa: access.requireMfa,
    overrideCount: access.overrideCount,
  };
});
