import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, adminRoute, getIp, parseBody } from "@/lib/http";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { staffColumns } from "./_columns";
import { audit } from "@/lib/audit";

export const GET = adminRoute("staff.manage", async () => {
  const [items, [{ n }]] = await Promise.all([
    db.select(staffColumns).from(schema.staff).orderBy(asc(schema.staff.name)).limit(500),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.staff),
  ]);
  return { items, total: n };
});

const Create = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().min(5).max(30).nullish(),
  role: z.enum(["super_admin", "admin", "sales_agent", "finance", "content"]),
  password: z.string().max(128),
});

export const POST = adminRoute("staff.manage", async ({ req, staff }) => {
  const body = await parseBody(req, Create);
  const problem = passwordProblem(body.password);
  if (problem) throw new ApiError(400, problem);
  const [dup] = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.email, body.email));
  if (dup) throw new ApiError(409, "A staff member with that email already exists");
  const [row] = await db.insert(schema.staff).values({
    name: body.name, email: body.email, phone: body.phone ?? null, role: body.role, passwordHash: await hashPassword(body.password),
  }).returning(staffColumns);
  await audit({ type: "staff", id: staff.id }, "staff.create", { entity: "staff", entityId: row.id, meta: { role: body.role }, ip: getIp(req) });
  return Response.json(row, { status: 201 });
});
