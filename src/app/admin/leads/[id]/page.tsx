"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Button, Card, ErrorNote, Field, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { usePerms } from "@/components/staff/usePerms";
import { api, fmtDate, useApi } from "@/lib/client";

type Detail = {
  lead: { id: string; name: string; email: string | null; phone: string | null; status: string; source: string; agentId: string | null; customerId: string | null; createdAt: string };
  notes: { id: string; body: string; createdAt: string; staffName: string | null }[];
  enquiries: { id: string; kind: string; message: string | null; createdAt: string }[];
  property: { id: string; name: string } | null; agent: { id: string; name: string } | null;
};
const STAGES = ["new", "contacted", "inspection_scheduled", "negotiation", "purchased", "lost"];

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, reload } = useApi<Detail>(`/api/admin/leads/${id}`);
  const { me, can } = usePerms();
  const canReassign = can("leads.write") && me?.role !== "sales_agent";
  const agents = useApi<{ items: { id: string; name: string }[] }>(canReassign && can("agents.read") ? "/api/admin/agents?active=1&pageSize=100" : null);
  const [note, setNote] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Lead not found"} />;
  const { lead } = data;
  const patch = async (body: object) => { setErr(null); try { await api(`/api/admin/leads/${id}`, { method: "PATCH", body }); await reload(); } catch (e) { setErr((e as Error).message); } };
  async function addNote(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api(`/api/admin/leads/${id}/notes`, { body: { body: note } }); setNote(""); await reload(); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title={lead.name} subtitle={[lead.email, lead.phone].filter(Boolean).join(" · ")} actions={<StatusBadge value={lead.status} />} />
      <ErrorNote message={err} />
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Notes">
            {can("leads.write") && (
              <form onSubmit={addNote} className="mb-5 space-y-2">
                <Field label="Add a note"><Textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called, wants a viewing on Friday…" /></Field>
                <Button type="submit" loading={busy}>Save note</Button>
              </form>
            )}
            {!data.notes.length ? <p className="text-sm text-brand-400">No notes yet.</p> : (
              <ul className="space-y-3">{[...data.notes].reverse().map((n) => (
                <li key={n.id} className="border-l-2 border-brand-200 pl-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-brand-400">{n.staffName ?? "Staff"} · {fmtDate(n.createdAt)}</p></li>))}</ul>
            )}
          </Card>
          {data.enquiries.length > 0 && <Card title="Original enquiries"><ul className="space-y-2 text-sm">{data.enquiries.map((e) => <li key={e.id}><span className="text-xs capitalize text-brand-500">{e.kind.replace("_", " ")} · {fmtDate(e.createdAt)}</span><p>{e.message ?? "—"}</p></li>)}</ul></Card>}
        </div>
        <div className="space-y-6">
          <Card title="Pipeline">
            <Field label="Stage"><Select disabled={!can("leads.write")} value={lead.status} onChange={(e) => patch({ status: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</Select></Field>
            <div className="mt-4"><Field label="Assigned agent">
              {canReassign ? <Select value={lead.agentId ?? ""} onChange={(e) => patch({ agentId: e.target.value || null })}><option value="">Unassigned</option>{agents.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
                : <p className="text-sm">{data.agent?.name ?? "Unassigned"}</p>}
            </Field></div>
          </Card>
          <Card title="Details"><dl className="space-y-3 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-brand-500">Interested in</dt><dd>{data.property ? <Link href={`/admin/properties/${data.property.id}`} className="underline">{data.property.name}</Link> : "General"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-brand-500">Source</dt><dd>{lead.source}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-brand-500">Created</dt><dd>{fmtDate(lead.createdAt)}</dd></div>
            {lead.customerId && can("customers.read") && <div><Link href={`/admin/customers/${lead.customerId}`} className="text-brand-600 underline">View customer account</Link></div>}
          </dl></Card>
        </div>
      </div>
    </>
  );
}
