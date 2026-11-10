"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";
import { api, fmtDate, naira, useApi } from "@/lib/client";

type Row = { id: string; propertyName: string; customerName: string; customerEmail: string; status: string; amountKobo: number; expiresAt: string | null };

export default function ReservationsPage() {
  const [status, setStatus] = useState(""); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(status && { status }), ...(q && { q }) }).toString();
  const { data, loading, error, reload } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/reservations?${qs}`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const canWrite = me.data?.permissions.includes("reservations.write") ?? false;
  const [adding, setAdding] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState(""); const [customerId, setCustomerId] = useState("");
  const props = useApi<{ items: { id: string; name: string }[] }>(adding ? "/api/admin/properties?status=available&pageSize=100" : null);
  const custs = useApi<{ items: { id: string; fullName: string; email: string }[] }>(adding ? "/api/admin/customers?pageSize=100" : null);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const act = async (id: string, body: object) => { setErr(null); try { await api(`/api/admin/reservations/${id}`, { method: "PATCH", body }); await reload(); } catch (e) { setErr((e as Error).message); } };
  async function create(e: React.FormEvent) { e.preventDefault(); setErr(null); try { await api("/api/admin/reservations", { body: { propertyId, customerId } }); setAdding(false); await reload(); } catch (x) { setErr((x as Error).message); } }

  return (
    <>
      <PageHeader title="Reservations" subtitle={data ? `${data.total} reservations` : undefined} actions={canWrite && <Button onClick={() => { setAdding(true); setErr(null); }}><Plus className="size-4" /> Reserve for customer</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <Input placeholder="Search property or customer" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["pending", "active", "expired", "cancelled", "converted"].map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
        <ErrorNote message={error ?? err} />
        {loading && !data ? <Spinner /> : <DataTable rows={data?.items ?? []} empty="No reservations."
          columns={[
            { header: "Property", cell: (r) => r.propertyName },
            { header: "Customer", cell: (r) => <div><div>{r.customerName}</div><div className="text-xs text-brand-400">{r.customerEmail}</div></div> },
            { header: "Fee", cell: (r) => naira(r.amountKobo) },
            { header: "Expires", cell: (r) => fmtDate(r.expiresAt) },
            { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
            { header: "", cell: (r) => canWrite && r.status === "active" ? <span className="flex gap-2"><Button variant="secondary" onClick={() => act(r.id, { action: "extend", days: 7 })}>+7 days</Button><Button variant="danger" onClick={() => confirm("Cancel this reservation?") && act(r.id, { action: "cancel" })}>Cancel</Button></span> : null },
          ]} />}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Reserve a property">
        <form onSubmit={create} className="space-y-4">
          <Field label="Property (available only)"><Select required value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Choose…</option>{props.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Customer"><Select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Choose…</option>{custs.data?.items.map((c) => <option key={c.id} value={c.id}>{c.fullName} — {c.email}</option>)}</Select></Field>
          <ErrorNote message={err} /><Button type="submit">Reserve</Button>
        </form>
      </Modal>
    </>
  );
}
