import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, adminRoute, getIp, notFound } from "@/lib/http";
import { setupCodeFor } from "@/lib/auth/setup-code";
import { audit } from "@/lib/audit";

/** Super admin only: the code a staff member needs for first-time two-step setup. */
export const GET = adminRoute("staff.manage", async ({ req, staff }) => {
  const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get("staffId"));
  if (!id.success) throw notFound();
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, id.data));
  if (!row) throw notFound();
  if (row.totpEnabled) throw new ApiError(409, "Two-step login is already set up for this person");
  await audit({ type: "staff", id: staff.id }, "staff.setup_code_issued", { entity: "staff", entityId: row.id, ip: getIp(req) });
  return { code: setupCodeFor(row) };
});
