import { timingSafeEqual } from "node:crypto";
import { unauthorized } from "@/lib/http";

/** Scheduled-job guard: `Authorization: Bearer ${CRON_SECRET}`. Fails closed when the secret is unset. */
export function requireCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !given) throw unauthorized("Invalid cron secret");
  const a = Buffer.from(secret), b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized("Invalid cron secret");
}
