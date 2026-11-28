import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, notFound, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";
import { assertCanPublish, assertCanReopen } from "@/lib/property-guard";
import { handlePropertyChange } from "@/lib/alerts";

/** Mark a property available / reserved / sold / draft. */
export const POST = adminRoute("properties.write", async ({ req, staff, params }) => {
  const { status } = await parseBody(req, z.object({ status: z.enum(["draft", "available", "reserved", "sold"]) }));
  if (!z.string().uuid().safeParse(params.id).success) throw notFound();
  await assertCanReopen(params.id, status);
  if (status === "available") await assertCanPublish(params.id);
  const [before] = await db.select().from(schema.properties).where(and(eq(schema.properties.id, params.id), isNull(schema.properties.deletedAt)));
  const [row] = await db.update(schema.properties).set({ status, updatedAt: new Date() })
    .where(and(eq(schema.properties.id, params.id), isNull(schema.properties.deletedAt))).returning();
  if (!row) throw notFound();
  void handlePropertyChange(before ?? null, row);
  await audit({ type: "staff", id: staff.id }, "property.status", { entity: "property", entityId: row.id, meta: { status }, ip: getIp(req) });
  return row;
});
