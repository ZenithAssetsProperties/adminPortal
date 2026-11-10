"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Spinner } from "@/components/ui";
import { usePerms } from "@/components/staff/usePerms";
import { api, useApi } from "@/lib/client";

type Row = { id: string; name: string; email: string; phone: string | null; active: boolean; propertyCount: number; openLeadCount: number };

export default function AgentsPage() {
  const router = useRouter();
  const { can } = usePerms();
  const { data, loading, error, reload } = useApi<{ items: Row[] }>("/api/admin/agents?pageSize=100");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/admin/agents", { body: { ...form, phone: form.phone || null } }); setOpen(false); setForm({ name: "", email: "", phone: "", password: "" }); await reload(); }
    catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Agents" subtitle="Sales agents and their workload" actions={can("agents.write") ? <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add agent</Button> : undefined} />
      <Card>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : (
          <DataTable rows={data?.items ?? []} onRowClick={(r) => router.push(`/admin/agents/${r.id}`)} empty="No agents yet."
            columns={[
              { header: "Agent", cell: (r) => <div><div className="font-medium text-brand-900">{r.name}</div><div className="text-xs text-brand-400">{r.email}</div></div> },
              { header: "Properties", cell: (r) => r.propertyCount }, { header: "Open leads", cell: (r) => r.openLeadCount },
              { header: "Status", cell: (r) => <Badge tone={r.active ? "green" : "grey"}>{r.active ? "Active" : "Deactivated"}</Badge> },
            ]} />
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a sales agent">
        <form onSubmit={create} className="space-y-4">
          <Field label="Full name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Initial password" hint="At least 12 characters with upper case, lower case and a number. Share it securely."><Input type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <ErrorNote message={err} /><Button type="submit" loading={busy}>Create agent</Button>
        </form>
      </Modal>
    </>
  );
}
