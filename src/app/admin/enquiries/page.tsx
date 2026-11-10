"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import Pager from "@/components/customers/Pager";
import { usePerms } from "@/components/staff/usePerms";
import { api, fmtDate, useApi } from "@/lib/client";

type Row = { id: string; kind: string; name: string; email: string | null; phone: string | null; message: string | null; handled: boolean; leadId: string | null; propertyName: string | null; createdAt: string };
const KINDS = ["enquiry", "callback", "consultation", "property_request", "whatsapp"];

export default function EnquiriesPage() {
  const { can } = usePerms();
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [handled, setHandled] = useState("0"); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(q && { q }), ...(kind && { kind }), ...(handled && { handled }) }).toString();
  const { data, loading, error, reload } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/enquiries?${qs}`);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "enquiry", name: "", email: "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); } };

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/admin/enquiries", { body: { ...form, email: form.email || null, phone: form.phone || null, message: form.message || null } }); setOpen(false); setForm({ kind: "enquiry", name: "", email: "", phone: "", message: "" }); await reload(); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Enquiries" subtitle={data ? `${data.total} shown` : undefined} actions={can("enquiries.write") ? <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Log enquiry</Button> : undefined} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_160px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-brand-300" /><Input className="pl-9" placeholder="Search name, contact or message" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">All types</option>{KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</Select>
          <Select value={handled} onChange={(e) => { setHandled(e.target.value); setPage(1); }}><option value="">All</option><option value="0">Open</option><option value="1">Handled</option></Select>
        </div>
        <ErrorNote message={err ?? error} />
        {loading && !data ? <Spinner /> : (
          <DataTable rows={data?.items ?? []} empty="No enquiries."
            columns={[
              { header: "From", cell: (r) => <div><div className="font-medium text-brand-900">{r.name}</div><div className="text-xs text-brand-400">{[r.email, r.phone].filter(Boolean).join(" · ")}</div></div> },
              { header: "About", cell: (r) => <div className="max-w-xs"><div className="text-xs capitalize text-brand-500">{r.kind.replace("_", " ")}{r.propertyName && ` · ${r.propertyName}`}</div><div className="line-clamp-2 text-sm">{r.message ?? "—"}</div></div> },
              { header: "Received", cell: (r) => fmtDate(r.createdAt) },
              { header: "Status", cell: (r) => <StatusBadge value={r.handled ? "completed" : "new"} /> },
              { header: "", cell: (r) => can("enquiries.write") && (
                <div className="flex flex-wrap justify-end gap-2">
                  {r.leadId ? <Link href={`/admin/leads/${r.leadId}`} className="text-sm text-brand-600 underline">View lead</Link>
                    : <Button variant="secondary" onClick={() => act(() => api(`/api/admin/enquiries/${r.id}/convert`, { body: {} }))}>Convert to lead</Button>}
                  <Button variant="ghost" onClick={() => act(() => api(`/api/admin/enquiries/${r.id}`, { method: "PATCH", body: { handled: !r.handled } }))}>{r.handled ? "Reopen" : "Mark handled"}</Button>
                </div>) },
            ]} />
        )}
        {data && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Log an enquiry">
        <form onSubmit={create} className="space-y-4">
          <Field label="Type"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</Select></Field>
          <Field label="Name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Message" hint="Email or phone is required. A lead is created automatically."><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <ErrorNote message={err} />
          <Button type="submit" loading={busy}>Save</Button>
        </form>
      </Modal>
    </>
  );
}
