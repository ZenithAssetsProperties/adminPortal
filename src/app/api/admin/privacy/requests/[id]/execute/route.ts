import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, adminRoute, getIp } from "@/lib/http";
import { buildCustomerDataExport, executeCustomerErasure } from "@/lib/privacy";

export const POST = adminRoute("privacy.manage", async ({ req, staff, params }) => {
  const [dsar] = await db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, params.id))
    .limit(1);

  if (!dsar) throw new ApiError(404, "DSAR request not found");
  if (dsar.status === "completed" || dsar.status === "rejected") {
    throw new ApiError(400, `Request is already ${dsar.status}`);
  }
  if (!dsar.customerId) {
    throw new ApiError(400, "DSAR is not linked to an active customer record");
  }

  const now = new Date();
  const ip = getIp(req);

  if (dsar.type === "access" || dsar.type === "portability") {
    const exportPackage = await buildCustomerDataExport(dsar.customerId);
    if (!exportPackage) throw new ApiError(404, "Customer record not found");

    const [updated] = await db
      .update(schema.privacyRequests)
      .set({
        status: "completed",
        completedAt: now,
        exportData: {
          exportedAt: exportPackage.exportedAt,
          recordCounts: {
            consents: exportPackage.consents.length,
            inspections: exportPackage.inspections.length,
            reservations: exportPackage.reservations.length,
            transactions: exportPackage.transactions.length,
            payments: exportPackage.payments.length,
          },
        },
        resolutionNotes: dsar.resolutionNotes ?? "Data export package generated.",
        updatedAt: now,
      })
      .where(eq(schema.privacyRequests.id, dsar.id))
      .returning();

    await audit(
      { type: "staff", id: staff.id },
      "privacy.dsar.export",
      {
        entity: "privacy_request",
        entityId: dsar.id,
        meta: { reference: dsar.reference, customerId: dsar.customerId },
        ip,
      },
    );

    return { request: updated, exportPackage };
  }

  if (dsar.type === "erasure") {
    const result = await executeCustomerErasure(dsar.customerId, staff.id, ip);
    if (!result) throw new ApiError(404, "Customer record not found");

    const [updated] = await db
      .update(schema.privacyRequests)
      .set({
        status: "completed",
        completedAt: now,
        resolutionNotes: dsar.resolutionNotes ?? `Customer PII anonymized (${result.anonymizedEmail}).`,
        updatedAt: now,
      })
      .where(eq(schema.privacyRequests.id, dsar.id))
      .returning();

    return { request: updated, erasureResult: result };
  }

  // rectification / restriction
  const [updated] = await db
    .update(schema.privacyRequests)
    .set({
      status: "completed",
      completedAt: now,
      resolutionNotes: dsar.resolutionNotes ?? `Privacy request (${dsar.type}) marked completed.`,
      updatedAt: now,
    })
    .where(eq(schema.privacyRequests.id, dsar.id))
    .returning();

  await audit(
    { type: "staff", id: staff.id },
    "privacy.dsar.complete",
    { entity: "privacy_request", entityId: dsar.id, meta: { type: dsar.type }, ip },
  );

  return { request: updated };
});
