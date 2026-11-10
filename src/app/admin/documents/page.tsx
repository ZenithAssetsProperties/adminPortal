"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";
import clsx from "clsx";
import { Button, Card, DataTable, ErrorNote, Input, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";
import { fmtDay, useApi } from "@/lib/client";
import UploadModal from "@/components/documents/UploadModal";
import DocumentDrawer from "@/components/documents/DocumentDrawer";
import AccessRequests from "@/components/documents/AccessRequests";
import { KIND_LABELS, fmtSize, kindLabel, type DocRow } from "@/components/documents/shared";

function Vault() {
  const propertyId = useSearchParams().get("propertyId") ?? "";
  const [tab, setTab] = useState<"docs" | "access">("docs");
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null); const [upload, setUpload] = useState(false);
  const qs = new URLSearchParams({ page: String(page), ...(q && { q }), ...(kind && { kind }), ...(status && { status }), ...(propertyId && { propertyId }) }).toString();
  const { data, loading, error, reload } = useApi<{ items: DocRow[]; total: number; pageSize: number }>(`/api/admin/documents?${qs}`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const perms = me.data?.permissions ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Documents" subtitle={propertyId ? "Showing one property's documents" : "Property documentation and customer document vault"}
        actions={perms.includes("documents.write") ? <Button onClick={() => setUpload(true)}><Upload className="size-4" /> Upload</Button> : null} />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {([["docs", "Documents"], ["access", "Access requests"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("px-4 py-2 text-sm", tab === k ? "border-b-2 border-brand-700 font-medium text-brand-900" : "text-brand-500")}>{l}</button>
        ))}
      </div>
      <Card>
        {tab === "access" ? <AccessRequests canDecide={perms.includes("documents.approve")} /> : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_160px]">
              <Input placeholder="Search by title" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
              <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} aria-label="Type"><option value="">All types</option>{Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All statuses</option>{["pending", "approved", "rejected"].map((s) => <option key={s}>{s}</option>)}</Select>
            </div>
            <ErrorNote message={error} />
            {loading && !data ? <Spinner /> : (
              <DataTable rows={data?.items ?? []} onRowClick={(r) => setOpen(r.id)} empty="No documents match."
                columns={[
                  { header: "Document", cell: (r) => <div><div className="font-medium text-brand-900">{r.title}</div><div className="text-xs text-brand-400">{kindLabel(r.kind)} · v{r.version}{r.versionCount > 1 && ` (${r.versionCount} versions)`} · {fmtSize(r.sizeBytes)}</div></div> },
                  { header: "Belongs to", cell: (r) => <div className="text-sm">{r.propertyName ?? "—"}{r.customerName && <div className="text-xs text-brand-400">{r.customerName}</div>}</div> },
                  { header: "Visibility", cell: (r) => <span className="text-sm capitalize">{r.visibility.replace("_", " ")}</span> },
                  { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
                  { header: "Added", cell: (r) => fmtDay(r.createdAt) },
                ]} />
            )}
            {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
          </>
        )}
      </Card>
      <UploadModal open={upload} onClose={() => setUpload(false)} onDone={reload} defaultPropertyId={propertyId || undefined} />
      <DocumentDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} perms={perms} />
    </>
  );
}

export default function DocumentsPage() { return <Suspense fallback={<Spinner />}><Vault /></Suspense>; }
