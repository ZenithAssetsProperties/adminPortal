"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { usePerms } from "@/components/staff/usePerms";
import { api, fmtDate, useApi } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

type Row = { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: string | null };
const ROLES = Object.keys(ROLE_LABELS) as Role[];

export default function StaffPage() {
  const { me } = usePerms();
  const { data, loading, error, reload } = useApi<{ items: Row[] }>("/api/admin/staff");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "sales_agent", password: "" });
  const [target, setTarget] = useState<Row | null>(null);
  const [newPw, setNewPw] = useState("");
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok?: string) => { setErr(null); setMsg(null); try { await fn(); if (ok) setMsg(ok); await reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    if (await run(() => api("/api/admin/staff", { body: { ...form, phone: form.phone || null } }), "Staff member created.")) { setOpen(false); setForm({ name: "", email: "", phone: "", role: "sales_agent", password: "" }); }
    setBusy(false);
  }
  const patch = (body: object) => run(() => api(`/api/admin/staff/${target!.id}`, { method: "PATCH", body }), "Updated.").then((ok) => ok && setTarget(null));
  const isSelf = target?.id === me?.id;

  return (
    <>
      <PageHeader title="Staff" subtitle="Super admin only. Every change here is recorded in the audit log." actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add staff</Button>} />
      <ErrorNote message={err ?? error} />{msg && <p role="status" className="mb-3 text-sm text-emerald-700">{msg}</p>}
      <Card>
        {loading && !data ? <Spinner /> : (
          <DataTable rows={data?.items ?? []} onRowClick={(r) => { setTarget(r); setNewPw(""); setErr(null); }} empty="No staff."
            columns={[
              { header: "Name", cell: (r) => <div><div className="font-medium text-brand-900">{r.name}</div><div className="text-xs text-brand-400">{r.email}</div></div> },
              { header: "Role", cell: (r) => ROLE_LABELS[r.role] },
              { header: "Last sign-in", cell: (r) => fmtDate(r.lastLoginAt) }, { header: "Status", cell: (r) => <Badge tone={r.active ? "green" : "grey"}>{r.active ? "Active" : "Deactivated"}</Badge> },
            ]} />
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Add staff member">
        <form onSubmit={create} className="space-y-4">
          <Field label="Full name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          <Field label="Initial password" hint="12+ characters, with upper case, lower case and a number."><Input type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <ErrorNote message={err} /><Button type="submit" loading={busy}>Create</Button>
        </form>
      </Modal>
      <Modal open={Boolean(target)} onClose={() => setTarget(null)} title={target?.name ?? ""}>
        {target && (
          <div className="space-y-5">
            <Field label="Role" hint={isSelf ? "You cannot change your own role." : undefined}>
              <Select disabled={isSelf} value={target.role} onChange={(e) => patch({ role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
            <div className="flex flex-wrap gap-2">
              <Button variant={target.active ? "danger" : "secondary"} disabled={isSelf && target.active} onClick={() => patch({ active: !target.active })}>{target.active ? "Deactivate" : "Reactivate"}</Button>
            </div>
            <form className="space-y-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); void run(() => api(`/api/admin/staff/${target.id}/reset-password`, { body: { password: newPw } }), "Password reset. They have been signed out.").then(() => { setNewPw(""); setTarget(null); }); }}>
              <Field label="Set a new password" hint="They are signed out everywhere."><Input type="password" autoComplete="new-password" minLength={12} required value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
              <Button type="submit" variant="secondary">Reset password</Button>
            </form>
            <ErrorNote message={err} />
          </div>
        )}
      </Modal>
    </>
  );
}
