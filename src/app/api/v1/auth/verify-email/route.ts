import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ApiError, parseBody, preflight, publicRoute } from "@/lib/http";
import { verifyPurposeToken } from "@/lib/customer-auth";

export const OPTIONS = preflight;
export const POST = publicRoute(async ({ req }) => {
  const { token } = await parseBody(req, z.object({ token: z.string().max(2000) }));
  const claims = await verifyPurposeToken<{ email: string }>("verify-email", token);
  if (!claims) throw new ApiError(400, "This verification link is invalid or has expired");
  // the token is bound to the email address it was sent to
  const [c] = await db.update(schema.customers).set({ emailVerified: true })
    .where(and(eq(schema.customers.id, claims.sub), eq(schema.customers.email, claims.email))).returning({ id: schema.customers.id });
  if (!c) throw new ApiError(400, "This verification link is invalid or has expired");
  return { ok: true };
}, { name: "verify-email", limit: 20 });
