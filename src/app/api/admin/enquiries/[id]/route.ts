import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminRoute, getIp, parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";
import { loadEnquiry } from "../_load";
import { requireUuid } from "../../agents/_id";

export const PATCH = adminRoute("enquiries.write", async ({ req, staff, params }) => {
  const id = requireUuid(params.id);
  const { handled } = await parseBody(req, z.object({ handled: z.boolean() }));
  await loadEnquiry(id, staff);
  const [row] = await db.update(schema.enquiries).set({ handled }).where(eq(schema.enquiries.id, id)).returning();
  await audit({ type: "staff", id: staff.id }, "enquiry.handled", { entity: "enquiry", entityId: id, meta: { handled }, ip: getIp(req) });
  return row;
});
