"use client";
import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, DataTable, ErrorNote, Input, PageHeader, Select, Spinner, Stat, StatusBadge } from "@/components/ui";
import { fmtDate, naira, useApi } from "@/lib/client";

type Row = { id: string; reference: string; customerName: string; propertyName: string; transactionRef: string; kind: string; method: string | null; status: string; amountKobo: number; paidAt: string | null; createdAt: string };

export default function PaymentsPage() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(1);
  const filters = { ...(q && { q }), ...(status && { status }), ...(from && { from }), ...(to && { to }) };
  const qs = new URLSearchParams({ page: String(page), ...filters }).toString();
  const { data, loading, error } = useApi<{ items: Row[]; total: number; pageSize: number; successTotalKobo: number }>(`/api/admin/payments?${qs}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHeader title="Payments" subtitle="Record offline payments from a transaction page."
        actions={<a href={`/api/admin/payments/export?${new URLSearchParams(filters).toString()}`}><Button variant="secondary"><Download className="size-4" /> Export CSV</Button></a>} />
      {data && <div className="mb-4 grid gap-4 sm:grid-cols-2"><Stat label="Matching payments" value={data.total} /><Stat label="Successful total" value={naira(data.successTotalKobo)} /></div>}
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Search reference or customer" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["pending", "success", "failed", "abandoned"].map((s) => <option key={s}>{s}</option>)}</Select>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : <DataTable rows={data?.items ?? []} empty="No payments match." columns={[
          { header: "Reference", cell: (r) => <span className="font-mono text-xs">{r.reference}</span> },
          { header: "Date", cell: (r) => fmtDate(r.paidAt ?? r.createdAt) },
          { header: "Customer", cell: (r) => <div><div>{r.customerName}</div><div className="text-xs text-brand-400">{r.propertyName}</div></div> },
          { header: "Kind", cell: (r) => <span className="capitalize">{r.kind} · {r.method?.replace("_", " ") ?? "online"}</span> },
          { header: "Amount", cell: (r) => naira(r.amountKobo) },
          { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
          { header: "", cell: (r) => r.status === "success" ? <Link className="text-brand-600 underline" href={`/admin/receipts/${r.id}`}>Receipt</Link> : null },
        ]} />}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </Card>
    </>
  );
}
