"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";
import Pager from "@/components/customers/Pager";
import { usePerms } from "@/components/staff/usePerms";
import { api, fmtDay, useApi } from "@/lib/client";

type Lead = { id: string; name: string; email: string | null; phone: string | null; status: string; source: string; agentName: string | null; propertyName: string | null; createdAt: string; updatedAt: string };
const STAGES = ["new", "contacted", "inspection_scheduled", "negotiation", "purchased", "lost"];

export default function LeadsPage() {
  const router = useRouter();
  const { can } = usePerms();
  const [view, setView] = useState<"table" | "pipeline">("pipeline");
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const pipeline = view === "pipeline";
  const qs = new URLSearchParams({ page: String(pipeline ? 1 : page), pageSize: pipeline ? "100" : "25", ...(q && { q }), ...(!pipeline && status && { status }) }).toString();
  const { data, loading, error, reload } = useApi<{ items: Lead[]; total: number; pageSize: number }>(`/api/admin/leads?${qs}`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "manual" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api<{ id: string }>("/api/admin/leads", { body: { ...form, email: form.email || null, phone: form.phone || null } }); setOpen(false); router.push(`/admin/leads/${r.id}`); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  async function move(id: string, to: string) { try { await api(`/api/admin/leads/${id}`, { method: "PATCH", body: { status: to } }); await reload(); } catch (e) { setErr((e as Error).message); } }

  return (
    <>
      <PageHeader title="Leads" subtitle="Every enquiry becomes a lead. Move them along the pipeline."
        actions={<>
          <Button variant="secondary" onClick={() => setView(pipeline ? "table" : "pipeline")}>{pipeline ? <><List className="size-4" /> Table</> : <><LayoutGrid className="size-4" /> Pipeline</>}</Button>
          {can("leads.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New lead</Button>}</>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-brand-300" /><Input className="pl-9" placeholder="Search name, email or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          {!pipeline && <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</Select>}
        </div>
        <ErrorNote message={err ?? error} />
        {loading && !data ? <Spinner /> : pipeline ? (
          <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
            {STAGES.map((s) => {
              const items = (data?.items ?? []).filter((l) => l.status === s);
              return (
                <div key={s} className="min-w-44 bg-brand-50 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-brand-600"><span>{s.replaceAll("_", " ")}</span><span>{items.length}</span></div>
                  <div className="space-y-2">
                    {items.map((l) => (
                      <div key={l.id} className="border border-line bg-white p-2 text-sm">
                        <button className="block w-full text-left font-medium text-brand-900 hover:underline" onClick={() => router.push(`/admin/leads/${l.id}`)}>{l.name}</button>
                        <div className="truncate text-xs text-brand-400">{l.propertyName ?? l.source}</div>
                        {can("leads.write") && <select aria-label={`Move ${l.name}`} value={l.status} onChange={(e) => move(l.id, e.target.value)} className="mt-2 w-full border border-brand-200 bg-white px-1 py-1 text-xs">
                          {STAGES.map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <DataTable rows={data?.items ?? []} onRowClick={(r) => router.push(`/admin/leads/${r.id}`)} empty="No leads."
            columns={[
              { header: "Lead", cell: (r) => <div><div className="font-medium text-brand-900">{r.name}</div><div className="text-xs text-brand-400">{[r.email, r.phone].filter(Boolean).join(" · ")}</div></div> },
              { header: "Interested in", cell: (r) => r.propertyName ?? "General" }, { header: "Source", cell: (r) => r.source },
              { header: "Agent", cell: (r) => r.agentName ?? "Unassigned" }, { header: "Stage", cell: (r) => <StatusBadge value={r.status} /> }, { header: "Updated", cell: (r) => fmtDay(r.updatedAt) },
            ]} />
        )}
        {!pipeline && data && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
        {pipeline && data && data.total > 100 && <p className="mt-3 text-xs text-brand-400">Showing the 100 most recently updated of {data.total}. Use the table to see all.</p>}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New lead">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Source" hint="Instagram, referral, walk-in…"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
          <ErrorNote message={err} /><Button type="submit" loading={busy}>Create lead</Button>
        </form>
      </Modal>
    </>
  );
}
