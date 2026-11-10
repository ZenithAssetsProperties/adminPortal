import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { customerRoute, parseBody, preflight } from "@/lib/http";

export const OPTIONS = preflight;
// Body { ids: [...] } marks those read; an empty body / no ids marks everything read. Only ever touches the caller's own rows.
export const POST = customerRoute(async ({ req, customer }) => {
  const raw = await req.text();
  const ids = raw ? (await parseBody(new Request(req.url, { method: "POST", body: raw }), z.object({ ids: z.array(z.string().uuid()).max(200).optional() }))).ids : undefined;
  const rows = await db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.customerId, customer.id), isNull(schema.notifications.readAt), ids ? inArray(schema.notifications.id, ids) : undefined))
    .returning({ id: schema.notifications.id });
  return { ok: true, marked: rows.length };
}, { name: "notif-read" });
