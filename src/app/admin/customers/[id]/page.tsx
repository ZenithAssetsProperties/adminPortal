"use client";
import { use, useState } from "react";
import { Button, Card, DataTable, ErrorNote, PageHeader, Spinner, StatusBadge, Badge } from "@/components/ui";
import { usePerms } from "@/components/staff/usePerms";
import { api, fmtDate, fmtDay, naira, useApi } from "@/lib/client";

type Detail = {
  customer: { id: string; fullName: string; email: string; phone: string | null; blocked: boolean; emailVerified: boolean; phoneVerified: boolean; idVerified: boolean; isDiaspora: boolean; country: string | null; source: string | null; createdAt: string; lastActiveAt: string | null };
  leads: { id: string; status: string; source: string; propertyName: string | null; createdAt: string }[];
  inspections: { id: string; kind: string; status: string; preferredDate: string; preferredTime: string; propertyName: string }[];
  reservations: { id: string; status: string; amountKobo: number; expiresAt: string | null; propertyName: string }[];
  transactions: { id: string; reference: string; stage: string; priceKobo: number; propertyName: string }[];
  payments: { id: string; reference: string; kind: string; status: string; amountKobo: number; paidAt: string | null }[];
  documents: { id: string; title: string; kind: string; status: string; version: number }[];
};

export default function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, reload } = useApi<Detail>(`/api/admin/customers/${id}`);
  const { can } = usePerms();
  const [err, setErr] = useState<string | null>(null);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Customer not found"} />;
  const c = data.customer;

  async function toggle() {
    if (!confirm(c.blocked ? "Unblock this customer? They will need to sign in again." : "Block this customer? They will be signed out everywhere.")) return;
    setErr(null);
    try { await api(`/api/admin/customers/${id}`, { method: "PATCH", body: { blocked: !c.blocked } }); await reload(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <PageHeader title={c.fullName} subtitle={c.email}
        actions={<>{c.blocked && <Badge tone="red">Blocked</Badge>}{can("customers.write") && <Button variant={c.blocked ? "secondary" : "danger"} onClick={toggle}>{c.blocked ? "Unblock" : "Block customer"}</Button>}</>} />
      <ErrorNote message={err} />
      <div className="mt-4 space-y-6">
        <Card title="Profile">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {[["Phone", c.phone ?? "—"], ["Country", c.country ?? "—"], ["Source", c.source ?? "—"], ["Joined", fmtDay(c.createdAt)], ["Last active", fmtDate(c.lastActiveAt)],
              ["Verification", [c.emailVerified && "Email", c.phoneVerified && "Phone", c.idVerified && "ID"].filter(Boolean).join(", ") || "None yet"]].map(([k, v]) => (
              <div key={k as string}><dt className="text-xs uppercase tracking-wide text-brand-500">{k}</dt><dd className="mt-0.5 text-brand-900">{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card title="Transactions"><DataTable rows={data.transactions} empty="No transactions." columns={[
          { header: "Reference", cell: (r) => r.reference }, { header: "Property", cell: (r) => r.propertyName }, { header: "Price", cell: (r) => naira(r.priceKobo) }, { header: "Stage", cell: (r) => <StatusBadge value={r.stage} /> }]} /></Card>
        <Card title="Payments"><DataTable rows={data.payments} empty="No payments." columns={[
          { header: "Reference", cell: (r) => r.reference }, { header: "Type", cell: (r) => <span className="capitalize">{r.kind}</span> }, { header: "Amount", cell: (r) => naira(r.amountKobo) },
          { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }, { header: "Paid", cell: (r) => fmtDate(r.paidAt) }]} /></Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Inspections"><DataTable rows={data.inspections} empty="No inspections." columns={[
            { header: "Property", cell: (r) => r.propertyName }, { header: "When", cell: (r) => `${fmtDay(r.preferredDate)} ${r.preferredTime}` }, { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }]} /></Card>
          <Card title="Reservations"><DataTable rows={data.reservations} empty="No reservations." columns={[
            { header: "Property", cell: (r) => r.propertyName }, { header: "Amount", cell: (r) => naira(r.amountKobo) }, { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }]} /></Card>
          <Card title="Leads"><DataTable rows={data.leads} empty="No leads." columns={[
            { header: "Property", cell: (r) => r.propertyName ?? "General" }, { header: "Source", cell: (r) => r.source }, { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }]} /></Card>
          <Card title="Documents"><DataTable rows={data.documents} empty="No documents." columns={[
            { header: "Title", cell: (r) => `${r.title} (v${r.version})` }, { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }]} /></Card>
        </div>
      </div>
    </>
  );
}
