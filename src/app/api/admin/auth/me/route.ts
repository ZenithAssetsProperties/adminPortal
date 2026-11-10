import { adminRoute } from "@/lib/http";
import { ROLE_PERMISSIONS } from "@/lib/rbac";

// Also used by the browser as a keep-alive ping (see adminRoute: refreshes the cookie).
export const GET = adminRoute(null, async ({ staff }) => ({ staff, permissions: ROLE_PERMISSIONS[staff.role] }));
