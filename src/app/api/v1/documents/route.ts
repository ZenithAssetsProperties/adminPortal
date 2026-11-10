import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerRoute, preflight } from "@/lib/http";
import { DOC_LABELS } from "@/lib/public-dto";

// Document vault (PRD 16): only the customer's own APPROVED documents. Each entry is the newest version plus its history.
export const OPTIONS = preflight;
export const GET = customerRoute(async ({ customer }) => {
  const rows = await db.select().from(schema.documents)
    .where(and(eq(schema.documents.customerId, customer.id), eq(schema.documents.status, "approved")))
    .orderBy(desc(schema.documents.version));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.groupId, [...(groups.get(r.groupId) ?? []), r]);
  const items = [...groups.values()].map(([current, ...older]) => ({
    id: current.id, title: current.title, kind: current.kind, label: DOC_LABELS[current.kind] ?? current.kind,
    version: current.version, mimeType: current.mimeType, sizeBytes: current.sizeBytes, transactionId: current.transactionId,
    createdAt: current.createdAt,
    previousVersions: older.map((o) => ({ id: o.id, version: o.version, createdAt: o.createdAt })),
  })).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return { items };
}, { name: "documents" });
