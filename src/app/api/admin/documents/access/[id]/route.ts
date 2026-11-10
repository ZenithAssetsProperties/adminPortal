import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, conflict, getIp, notFound, parseBody } from "@/lib/http";
import { notifyCustomer } from "@/lib/notify";
import { audit } from "@/lib/audit";

export const POST = adminRoute("documents.approve", async ({ req, staff, params }) => {
  const { decision } = await parseBody(req, z.object({ decision: z.enum(["approve", "deny"]) }));
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  const [reqRow] = await db.select().from(schema.documentAccess).where(eq(schema.documentAccess.id, params.id));
  if (!reqRow) throw notFound();
  if (reqRow.status !== "pending") throw conflict("This request was already decided");
  const status = decision === "approve" ? "approved" : "denied";
  await db.update(schema.documentAccess).set({ status, decidedBy: staff.id, decidedAt: new Date() }).where(eq(schema.documentAccess.id, reqRow.id));
  const [doc] = await db.select({ title: schema.documents.title }).from(schema.documents).where(eq(schema.documents.id, reqRow.documentId));
  await notifyCustomer(reqRow.customerId, {
    type: "document_access", title: status === "approved" ? "Document access approved" : "Document access declined",
    body: status === "approved" ? `You can now view "${doc?.title}".` : `Your request to view "${doc?.title}" was not approved. Contact your agent for details.`,
  });
  await audit({ type: "staff", id: staff.id }, `document.access_${status}`, { entity: "document_access", entityId: reqRow.id, meta: { documentId: reqRow.documentId, customerId: reqRow.customerId }, ip: getIp(req) });
  return { ok: true, status };
});
