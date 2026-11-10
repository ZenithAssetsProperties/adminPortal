import { z } from "zod";
import { notFound } from "@/lib/http";

/** Throws 404 unless the path segment is a real uuid (stops bad ids reaching the database). */
export function requireUuid(v: string | undefined): string {
  if (!v || !z.string().uuid().safeParse(v).success) throw notFound();
  return v;
}
