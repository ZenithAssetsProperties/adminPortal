import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminRoute, getIp, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireUuid } from "../../../agents/_id";

// Clears two-step login so the person must enrol a new authenticator (admins are forced to at next sign-in).
export const POST = adminRoute("staff.manage", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const [t] = await db.select({ tv: schema.staff.tokenVersion }).from(schema.staff).where(eq(schema.staff.id, id));
  if (!t) throw notFound();
  await db.update(schema.staff).set({ totpSecret: null, totpEnabled: false, tokenVersion: t.tv + 1 }).where(eq(schema.staff.id, id));
  await audit({ type: "staff", id: staff.id }, "staff.2fa_reset", { entity: "staff", entityId: id, ip: getIp(req) });
  return { ok: true };
});
