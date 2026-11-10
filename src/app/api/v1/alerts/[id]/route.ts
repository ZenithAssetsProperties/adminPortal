import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, notFound, preflight } from "@/lib/http";
import { uuidOr404 } from "@/lib/public-dto";

export const OPTIONS = preflight;
export const DELETE = customerRoute(async ({ customer, params }) => {
  const [row] = await db.delete(schema.alerts).where(and(eq(schema.alerts.id, uuidOr404(params.id)), eq(schema.alerts.customerId, customer.id))).returning({ id: schema.alerts.id });
  if (!row) throw notFound("Alert not found");
  return { ok: true };
}, { name: "alerts-del" });
