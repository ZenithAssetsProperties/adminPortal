import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, adminRoute, badRequest, getIp, notFound, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";
import { requireUuid } from "../../agents/_id";
import { staffColumns } from "../_columns";
import { assertNotLastSuperAdmin } from "../_guards";

const Patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(5).max(30).nullish(),
  role: z.enum(["super_admin", "admin", "sales_agent", "finance", "content"]).optional(),
  active: z.boolean().optional(),
});

export const PATCH = adminRoute("staff.manage", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const body = await parseBody(req, Patch);
  if (!Object.keys(body).length) throw badRequest("Nothing to update");
  const [target] = await db.select().from(schema.staff).where(eq(schema.staff.id, id));
  if (!target) throw notFound();
  const isSelf = target.id === staff.id;
  if (isSelf && body.active === false) throw new ApiError(409, "You cannot deactivate your own account");
  if (isSelf && body.role && body.role !== target.role) throw new ApiError(409, "You cannot change your own role");

  const losesSuper = target.role === "super_admin" && target.active && ((body.role && body.role !== "super_admin") || body.active === false);
  if (losesSuper) await assertNotLastSuperAdmin(target.id);

  const set: Partial<typeof schema.staff.$inferInsert> = {};
  if (body.name) set.name = body.name;
  if (body.phone !== undefined) set.phone = body.phone;
  if (body.role) set.role = body.role;
  if (body.active !== undefined) {
    set.active = body.active;
    if (!body.active) set.tokenVersion = target.tokenVersion + 1; // signs them out everywhere
  }
  const [row] = await db.update(schema.staff).set(set).where(eq(schema.staff.id, id)).returning(staffColumns);
  const action = body.active === false ? "staff.deactivate" : body.active === true ? "staff.reactivate" : body.role ? "staff.role_change" : "staff.update";
  await audit({ type: "staff", id: staff.id }, action, { entity: "staff", entityId: id, meta: { from: target.role, to: row.role }, ip: getIp(req) });
  return row;
});

