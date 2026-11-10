import { sql } from "drizzle-orm";
import { schema } from "@/db";
import { badRequest } from "@/lib/http";
import { MAX_UPLOAD_BYTES, sniffType } from "@/lib/storage";

export const DOC_KINDS = schema.docKind.enumValues;
export const DOC_MIMES = ["application/pdf", "image/jpeg", "image/png"];

/** SQL condition: keep only the newest version of each document group. */
export const currentVersionOnly = sql`not exists (select 1 from documents d2 where d2.group_id = ${schema.documents.groupId} and d2.version > ${schema.documents.version})`;

type DocLike = { status: string; visibility: string; customerId: string | null };

/**
 * The single rule for what a buyer may see. A document is visible only when staff
 * have approved it AND one of these holds: it is public, it belongs to this customer,
 * or it is "request only" and the customer's access request was approved.
 */
export function isVisibleToCustomer(doc: DocLike, customerId: string | null, accessGranted: boolean): boolean {
  if (doc.status !== "approved") return false;
  if (doc.visibility === "public") return true;
  if (customerId && doc.customerId === customerId) return true;
  if (doc.visibility === "request_only") return accessGranted;
  return false;
}

/** Validates an uploaded file by its real bytes: PDF, JPEG or PNG, 15 MB max. */
export async function readUpload(file: unknown) {
  if (!(file instanceof File)) throw badRequest("Choose a file to upload");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("File is too large (15 MB maximum)");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (!type || !DOC_MIMES.includes(type.mime)) throw badRequest("Upload a PDF, JPG or PNG file");
  return { buf, mime: type.mime, ext: type.ext, size: buf.length };
}

/** Form fields as a plain object; blank strings become undefined so optional zod fields work. */
export function formFields(form: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
  return out;
}

/** One CSV cell, safe against spreadsheet formula injection (=, +, -, @ at the start of text). */
export function csvCell(v: unknown): string {
  if (typeof v === "number") return String(v);
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");
