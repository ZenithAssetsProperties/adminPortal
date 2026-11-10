"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Badge, Button, Card, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { usePerms } from "@/components/staff/usePerms";
import { api, useApi } from "@/lib/client";

type Detail = {
  agent: { id: string; name: string; email: string; phone: string | null; active: boolean };
  properties: { id: string; name: string; status: string; city: string }[];
  leads: { id: string; name: string; status: string }[];
};
type Pick = { id: string; name: string; agentId?: string | null; status?: string };

export default function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = usePerms();
  const { data, loading, error, reload } = useApi<Detail>(`/api/admin/agents/${id}`);
  const [assigning, setAssigning] = useState(false);
  const props = useApi<{ items: Pick[] }>(assigning && can("properties.read") ? "/api/admin/properties?pageSize=100" : null);
  const leads = useApi<{ items: Pick[] }>(assigning ? "/api/admin/leads?unassigned=1&pageSize=100" : null);
  const [selP, setSelP] = useState<string[]>([]); const [selL, setSelL] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Agent not found"} />;
  const { agent } = data;
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function assign() {
    setErr(null); setMsg(null);
    try {
      const r = await api<{ propertiesAssigned: number; leadsAssigned: number }>(`/api/admin/agents/${id}/assign`, { body: { propertyIds: selP, leadIds: selL } });
      setMsg(`Assigned ${r.propertiesAssigned} properties and ${r.leadsAssigned} leads.`); setSelP([]); setSelL([]); await reload();
    } catch (e) { setErr((e as Error).message); }
  }
  async function setActive(active: boolean) {
    if (!active && !confirm("Deactivate this agent? They will be signed out immediately.")) return;
    setErr(null); try { await api(`/api/admin/agents/${id}`, { method: "PATCH", body: { active } }); await reload(); } catch (e) { setErr((e as Error).message); }
  }
  const canWrite = can("agents.write");
  return (
    <>
      <PageHeader title={agent.name} subtitle={[agent.email, agent.phone].filter(Boolean).join(" · ")}
        actions={<><Badge tone={agent.active ? "green" : "grey"}>{agent.active ? "Active" : "Deactivated"}</Badge>
          {canWrite && <Button variant={agent.active ? "danger" : "secondary"} onClick={() => setActive(!agent.active)}>{agent.active ? "Deactivate" : "Reactivate"}</Button>}</>} />
      <ErrorNote message={err} />{msg && <p role="status" className="mb-3 text-sm text-emerald-700">{msg}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Properties (${data.properties.length})`}>
          {!data.properties.length ? <p className="text-sm text-brand-400">None assigned.</p> : <ul className="divide-y divide-line text-sm">{data.properties.map((p) => <li key={p.id} className="flex items-center justify-between py-2"><Link className="underline" href={`/admin/properties/${p.id}`}>{p.name}</Link><StatusBadge value={p.status} /></li>)}</ul>}
        </Card>
        <Card title={`Open leads (${data.leads.length})`}>
          {!data.leads.length ? <p className="text-sm text-brand-400">None.</p> : <ul className="divide-y divide-line text-sm">{data.leads.map((l) => <li key={l.id} className="flex items-center justify-between py-2"><Link className="underline" href={`/admin/leads/${l.id}`}>{l.name}</Link><StatusBadge value={l.status} /></li>)}</ul>}
        </Card>
      </div>
      {canWrite && agent.active && (
        <Card className="mt-6" title="Assign work" actions={<Button variant="secondary" onClick={() => setAssigning(!assigning)}>{assigning ? "Hide" : "Choose items"}</Button>}>
          {!assigning ? <p className="text-sm text-brand-500">Pick properties and unassigned leads to hand to {agent.name}.</p> : (
            <div className="space-y-4">
              <div className="grid gap-6 md:grid-cols-2">
                <div><h3 className="mb-2 text-lg">Properties</h3><div className="max-h-64 space-y-1 overflow-y-auto border border-line p-2 text-sm">
                  {(props.data?.items ?? []).filter((p) => p.agentId !== id).map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={selP.includes(p.id)} onChange={() => toggle(selP, setSelP, p.id)} />{p.name}</label>)}
                  {props.loading && <Spinner />}</div></div>
                <div><h3 className="mb-2 text-lg">Unassigned leads</h3><div className="max-h-64 space-y-1 overflow-y-auto border border-line p-2 text-sm">
                  {(leads.data?.items ?? []).map((l) => <label key={l.id} className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={selL.includes(l.id)} onChange={() => toggle(selL, setSelL, l.id)} />{l.name}</label>)}
                  {leads.loading ? <Spinner /> : !leads.data?.items.length && <span className="text-brand-400">No unassigned leads.</span>}</div></div>
              </div>
              <Button disabled={!selP.length && !selL.length} onClick={assign}>Assign {selP.length + selL.length} selected</Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
