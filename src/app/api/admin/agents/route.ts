import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, adminRoute, getIp, parseBody, parseQuery } from "@/lib/http";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { audit } from "@/lib/audit";

const Q = PageQuery.extend({ active: z.enum(["1", "0"]).optional() });

export const GET = adminRoute("agents.read", async ({ req }) => {
  const q = parseQuery(req, Q);
  const conds: (SQL | undefined)[] = [eq(schema.staff.role, "sales_agent")];
  if (q.active) conds.push(eq(schema.staff.active, q.active === "1"));
  if (q.q) { const l = likeEscape(q.q); conds.push(or(ilike(schema.staff.name, l), ilike(schema.staff.email, l))); }
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db.select({
      id: schema.staff.id, name: schema.staff.name, email: schema.staff.email, phone: schema.staff.phone, active: schema.staff.active,
      propertyCount: sql<number>`(select count(*)::int from ${schema.properties} p where p.agent_id = "staff"."id" and p.deleted_at is null)`,
      openLeadCount: sql<number>`(select count(*)::int from ${schema.leads} l where l.agent_id = "staff"."id" and l.status not in ('purchased','lost'))`,
    }).from(schema.staff).where(where).orderBy(asc(schema.staff.name)).limit(q.pageSize).offset(offset(q)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.staff).where(where),
  ]);
  return paged(items, n, q);
});

const Create = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().min(5).max(30).nullish(),
  password: z.string().max(128),
});

export const POST = adminRoute("agents.write", async ({ req, staff }) => {
  const body = await parseBody(req, Create);
  const problem = passwordProblem(body.password);
  if (problem) throw new ApiError(400, problem);
  const [dup] = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.email, body.email));
  if (dup) throw new ApiError(409, "A staff member with that email already exists");
  const [row] = await db.insert(schema.staff).values({
    name: body.name, email: body.email, phone: body.phone ?? null, role: "sales_agent", passwordHash: await hashPassword(body.password),
  }).returning({ id: schema.staff.id, name: schema.staff.name, email: schema.staff.email, phone: schema.staff.phone, active: schema.staff.active });
  await audit({ type: "staff", id: staff.id }, "agent.create", { entity: "staff", entityId: row.id, ip: getIp(req) });
  return Response.json(row, { status: 201 });
});
