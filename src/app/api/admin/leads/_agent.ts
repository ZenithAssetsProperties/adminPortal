import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { badRequest } from "@/lib/http";

/** A lead may only be handed to an active sales agent. */
export async function assertAssignableAgent(agentId: string) {
  const [a] = await db.select({ id: schema.staff.id }).from(schema.staff)
    .where(and(eq(schema.staff.id, agentId), eq(schema.staff.role, "sales_agent"), eq(schema.staff.active, true)));
  if (!a) throw badRequest("Pick an active sales agent");
}
