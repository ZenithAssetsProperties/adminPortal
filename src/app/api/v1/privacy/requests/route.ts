import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { customerRoute, getIp, parseBody, preflight } from "@/lib/http";
import { getPrivacySettings } from "@/lib/privacy";

export const OPTIONS = preflight;

export const GET = customerRoute(
  async ({ customer }) => {
    const items = await db
      .select({
        id: schema.privacyRequests.id,
        reference: schema.privacyRequests.reference,
        type: schema.privacyRequests.type,
        status: schema.privacyRequests.status,
        dueAt: schema.privacyRequests.dueAt,
        completedAt: schema.privacyRequests.completedAt,
        createdAt: schema.privacyRequests.createdAt,
      })
      .from(schema.privacyRequests)
      .where(eq(schema.privacyRequests.customerId, customer.id))
      .orderBy(desc(schema.privacyRequests.createdAt));

    return { items };
  },
  { limit: 60, name: "v1-privacy-requests-get" },
);

const CreateDsar = z.object({
  type: z.enum(["access", "erasure", "rectification", "restriction", "portability"]),
  reason: z.string().trim().max(1000).optional(),
});

export const POST = customerRoute(
  async ({ req, customer }) => {
    const body = await parseBody(req, CreateDsar);
    const settings = await getPrivacySettings();
    const ref = `DSAR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const dueAt = new Date(Date.now() + settings.dsarSlaDays * 86_400_000);

    const [created] = await db
      .insert(schema.privacyRequests)
      .values({
        reference: ref,
        customerId: customer.id,
        subjectEmail: customer.email,
        type: body.type,
        status: "pending",
        reason: body.reason ?? null,
        requestedBy: "customer",
        dueAt,
      })
      .returning({
        id: schema.privacyRequests.id,
        reference: schema.privacyRequests.reference,
        type: schema.privacyRequests.type,
        status: schema.privacyRequests.status,
        dueAt: schema.privacyRequests.dueAt,
        createdAt: schema.privacyRequests.createdAt,
      });

    await audit(
      { type: "customer", id: customer.id },
      "privacy.dsar.customer_submit",
      {
        entity: "privacy_request",
        entityId: created.id,
        meta: { reference: ref, type: body.type },
        ip: getIp(req),
      },
    );

    return Response.json(created, { status: 201 });
  },
  { limit: 10, name: "v1-privacy-requests-post" },
);
