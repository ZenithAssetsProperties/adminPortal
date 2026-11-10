"use client";
import { useState } from "react";
import { Button, Card, DataTable, ErrorNote, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { fmtDate, useApi } from "@/lib/client";

type Row = { id: string; actorType: string; actorName: string | null; action: string; entity: string | null; entityId: string | null; ip: string | null; createdAt: string; meta: Record<string, unknown> | null };

export default function AuditPage() {
  const [f, setF] = useState({ action: "", actorType: "", entity: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: "50", ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const { data, loading, error } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/audit?${qs}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  return (
    <>
      <PageHeader title="Audit log" subtitle="A permanent record of important actions. It cannot be edited." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Action starts with"><Input placeholder="document." value={f.action} onChange={(e) => set("action", e.target.value)} /></Field>
          <Field label="Who"><Select value={f.actorType} onChange={(e) => set("actorType", e.target.value)}><option value="">Anyone</option><option value="staff">Staff</option><option value="customer">Customer</option><option value="system">System</option></Select></Field>
          <Field label="Record type"><Input placeholder="property" value={f.entity} onChange={(e) => set("entity", e.target.value)} /></Field>
          <Field label="From"><Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : (
          <DataTable rows={data?.items ?? []} empty="No activity matches."
            columns={[
              { header: "When", cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.createdAt)}</span> },
              { header: "Who", cell: (r) => <div>{r.actorName ?? <span className="capitalize">{r.actorType}</span>}{r.ip && <div className="text-xs text-brand-400">{r.ip}</div>}</div> },
              { header: "Action", cell: (r) => <code className="text-xs">{r.action}</code> },
              { header: "Record", cell: (r) => <div className="text-xs">{r.entity}{r.entityId && <div className="break-all text-brand-400">{r.entityId}</div>}</div> },
              { header: "Details", cell: (r) => r.meta ? <code className="break-all text-xs text-brand-500">{JSON.stringify(r.meta)}</code> : null },
            ]} />
        )}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </Card>
    </>
  );
}
