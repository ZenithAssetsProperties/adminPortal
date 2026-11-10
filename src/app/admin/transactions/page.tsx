"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";
import { api, naira, useApi } from "@/lib/client";
import { ALL_STAGES, STAGE_LABELS, type Stage } from "@/lib/transactions";

type Row = { id: string; reference: string; customerName: string; propertyName: string; stage: Stage; priceKobo: number; paidKobo: number; outstandingKobo: number };

export default function TransactionsPage() {
  const router = useRouter();
  const [q, setQ] = useState(""); const [stage, setStage] = useState(""); const [owing, setOwing] = useState(false); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(q && { q }), ...(stage && { stage }), ...(owing && { outstanding: "1" }) }).toString();
  const { data, loading, error } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/transactions?${qs}`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const canWrite = me.data?.permissions.includes("transactions.write") ?? false;
  const [adding, setAdding] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState(""); const [customerId, setCustomerId] = useState(""); const [months, setMonths] = useState(""); const [deposit, setDeposit] = useState("");
  const props = useApi<{ items: { id: string; name: string }[] }>(adding ? "/api/admin/properties?pageSize=100" : null);
  const custs = useApi<{ items: { id: string; fullName: string; email: string }[] }>(adding ? "/api/admin/customers?pageSize=100" : null);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { const r = await api<{ id: string }>("/api/admin/transactions", { body: { propertyId, customerId, ...(months && { planMonths: Number(months), depositPercent: Number(deposit || 0) }) } }); router.push(`/admin/transactions/${r.id}`); } catch (x) { setErr((x as Error).message); }
  }
  return (
    <>
      <PageHeader title="Transactions" subtitle={data ? `${data.total} transactions` : undefined} actions={canWrite && <Button onClick={() => { setAdding(true); setErr(null); }}><Plus className="size-4" /> New transaction</Button>} />
      <Card>
        <div className="mb-4 grid items-center gap-3 sm:grid-cols-[1fr_220px_auto]">
          <Input placeholder="Search reference, customer or property" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select aria-label="Stage" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}><option value="">All stages</option>{ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}</Select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={owing} onChange={(e) => { setOwing(e.target.checked); setPage(1); }} className="size-4 accent-brand-700" /> Outstanding only</label>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : <DataTable rows={data?.items ?? []} onRowClick={(r) => router.push(`/admin/transactions/${r.id}`)} empty="No transactions."
          columns={[
            { header: "Reference", cell: (r) => <span className="font-mono text-xs">{r.reference}</span> },
            { header: "Customer", cell: (r) => r.customerName },
            { header: "Property", cell: (r) => r.propertyName },
            { header: "Price", cell: (r) => naira(r.priceKobo) },
            { header: "Outstanding", cell: (r) => <span className={r.outstandingKobo > 0 ? "text-accent-700" : "text-emerald-700"}>{naira(r.outstandingKobo)}</span> },
            { header: "Stage", cell: (r) => <StatusBadge value={r.stage} /> },
          ]} />}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="New transaction">
        <form onSubmit={create} className="space-y-4">
          <Field label="Property"><Select required value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Choose…</option>{props.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Customer"><Select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Choose…</option>{custs.data?.items.map((c) => <option key={c.id} value={c.id}>{c.fullName} — {c.email}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Plan months" hint="Optional"><Input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(e.target.value)} /></Field><Field label="Deposit %"><Input type="number" min={0} max={100} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field></div>
          <ErrorNote message={err} /><Button type="submit">Create</Button>
        </form>
      </Modal>
    </>
  );
}
