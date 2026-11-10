import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "@/lib/http";

/** Refuses an action that would leave the system with no active super admin. */
export async function assertNotLastSuperAdmin(targetId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.staff)
    .where(and(eq(schema.staff.role, "super_admin"), eq(schema.staff.active, true), ne(schema.staff.id, targetId)));
  if (n === 0) throw new ApiError(409, "There must always be at least one active super admin");
}
