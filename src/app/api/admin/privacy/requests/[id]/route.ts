import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp, parseBody } from "@/lib/http";

const PatchRequest = z.object({
  status: z.enum(["pending", "in_review", "approved", "rejected"]).optional(),
  assignedTo: z.string().uuid().nullish(),
  resolutionNotes: z.string().trim().max(1500).nullish(),
});

export const PATCH = adminRoute("privacy.manage", async ({ req, staff, params }) => {
  const body = await parseBody(req, PatchRequest);
  const [existing] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, params.id))
    .limit(1);

  if (!existing) throw new ApiError(404, "DSAR request not found");
  if (existing.status === "completed") {
    throw new ApiError(400, "Completed DSAR requests cannot be modified");
  }

  const [updated] = await db
    .update(schema.privacyRequests)
    .set({
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo } : {}),
      ...(body.resolutionNotes !== undefined ? { resolutionNotes: body.resolutionNotes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.privacyRequests.id, params.id))
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "privacy.dsar.update",
    {
      entity: "privacy_request",
      entityId: updated.id,
      meta: { status: updated.status, reference: updated.reference },
      ip: getIp(req),
    },
  );

  return updated;
});
