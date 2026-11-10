import { db, schema } from "@/db";

type Actor = { type: "staff" | "customer" | "system"; id?: string | null };

export async function audit(
  actor: Actor, action: string,
  opts: { entity?: string; entityId?: string; meta?: Record<string, unknown>; ip?: string | null } = {},
) {
  try {
    await db.insert(schema.auditLogs).values({
      actorType: actor.type, actorId: actor.id ?? null, action,
      entity: opts.entity, entityId: opts.entityId, meta: opts.meta, ip: opts.ip ?? null,
    });
  } catch (e) {
    // an audit failure must never break the user's action, but it must be visible
    console.error("AUDIT WRITE FAILED", action, e);
  }
}
