import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp, parseBody, parseQuery } from "@/lib/http";
import { getPrivacySettings, maskEmail } from "@/lib/privacy";
import { PageQuery, likeEscape, offset, paged } from "@/lib/query";

const Q = PageQuery.extend({
  status: z.enum(["pending", "in_review", "approved", "completed", "rejected"]).optional(),
  type: z.enum(["access", "erasure", "rectification", "restriction", "portability"]).optional(),
});

export const GET = adminRoute("privacy.read", async ({ req, staff }) => {
  const q = parseQuery(req, Q);
  const r = schema.privacyRequests;
  const conds: (SQL | undefined)[] = [];
  if (q.status) conds.push(eq(r.status, q.status));
  if (q.type) conds.push(eq(r.type, q.type));
  if (q.q) {
    const l = likeEscape(q.q);
    conds.push(or(ilike(r.reference, l), ilike(r.subjectEmail, l)));
  }
  const where = and(...conds);
  const [items, [{ n }]] = await Promise.all([
    db
      .select({
        id: r.id,
        reference: r.reference,
        customerId: r.customerId,
        subjectEmail: r.subjectEmail,
        type: r.type,
        status: r.status,
        reason: r.reason,
        resolutionNotes: r.resolutionNotes,
        requestedBy: r.requestedBy,
        assignedTo: r.assignedTo,
        assignedName: schema.staff.name,
        dueAt: r.dueAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
      })
      .from(r)
      .leftJoin(schema.staff, eq(schema.staff.id, r.assignedTo))
      .where(where)
      .orderBy(desc(r.createdAt))
      .limit(q.pageSize)
      .offset(offset(q)),
    db.select({ n: count() }).from(r).where(where),
  ]);

  const piiLevel = staff.piiAccessLevel ?? "full";
  const masked = items.map((item) => ({
    ...item,
    subjectEmail: piiLevel === "full" ? item.subjectEmail : maskEmail(item.subjectEmail, piiLevel),
  }));

  return paged(masked, Number(n), q);
});

const CreateRequest = z.object({
  customerId: z.string().uuid().optional(),
  subjectEmail: z.string().trim().toLowerCase().email().max(200),
  type: z.enum(["access", "erasure", "rectification", "restriction", "portability"]),
  reason: z.string().trim().max(1000).optional(),
});

export const POST = adminRoute("privacy.manage", async ({ req, staff }) => {
  const body = await parseBody(req, CreateRequest);
  const settings = await getPrivacySettings();

  let customerId = body.customerId ?? null;
  if (!customerId) {
    const [found] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.email, body.subjectEmail))
      .limit(1);
    customerId = found?.id ?? null;
  }

  if (!customerId && body.type === "erasure") {
    throw new ApiError(404, "No matching customer account found for erasure");
  }

  const ref = `DSAR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const dueAt = new Date(Date.now() + settings.dsarSlaDays * 86_400_000);

  const [created] = await db
    .insert(schema.privacyRequests)
    .values({
      reference: ref,
      customerId,
      subjectEmail: body.subjectEmail,
      type: body.type,
      status: "pending",
      reason: body.reason ?? null,
      requestedBy: "staff",
      assignedTo: staff.id,
      dueAt,
    })
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "privacy.dsar.create",
    {
      entity: "privacy_request",
      entityId: created.id,
      meta: { reference: ref, type: body.type },
      ip: getIp(req),
    },
  );

  return Response.json(created, { status: 201 });
});
