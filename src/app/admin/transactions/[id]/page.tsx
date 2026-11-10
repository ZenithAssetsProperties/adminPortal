"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Button, Card, DataTable, ErrorNote, Field, PageHeader, Select, Spinner, Stat, StatusBadge, Textarea } from "@/components/ui";
import StageTimeline from "@/components/transactions/StageTimeline";
import RecordPayment from "@/components/payments/RecordPayment";
import { api, fmtDate, naira, useApi } from "@/lib/client";
import { ALL_STAGES, STAGE_LABELS, type Stage, type StepState } from "@/lib/transactions";

type Detail = {
  id: string; reference: string; stage: Stage; priceKobo: number; paidKobo: number; outstandingKobo: number; planMonths: number | null; depositPercent: number | null; agentId: string | null;
  customer: { id: string; fullName: string; email: string; phone: string | null }; property: { id: string; name: string; city: string; area: string | null };
  payments: { id: string; reference: string; kind: string; method: string | null; status: string; amountKobo: number; paidAt: string | null; createdAt: string }[];
  events: { id: string; stage: Stage; note: string | null; createdAt: string }[];
  progress: { stage: string; label: string; state: StepState }[];
};

export default function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, reload } = useApi<Detail>(`/api/admin/transactions/${id}`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const agents = useApi<{ items: { id: string; name: string }[] }>("/api/admin/agents?pageSize=100&active=1");
  const [stage, setStage] = useState(""); const [note, setNote] = useState(""); const [err, setErr] = useState<string | null>(null);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Not found"} />;
  const canWrite = me.data?.permissions.includes("transactions.write") ?? false;
  const canPay = me.data?.permissions.includes("payments.write") ?? false;
  const patch = async (body: object) => { setErr(null); try { await api(`/api/admin/transactions/${id}`, { method: "PATCH", body }); setStage(""); setNote(""); await reload(); } catch (e) { setErr((e as Error).message); } };

  return (
    <>
      <PageHeader title={data.property.name} subtitle={`${data.reference} · ${data.customer.fullName}`} actions={<StatusBadge value={data.stage} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3"><Stat label="Price" value={naira(data.priceKobo)} /><Stat label="Paid" value={naira(data.paidKobo)} /><Stat label="Outstanding" value={naira(data.outstandingKobo)} sub={data.planMonths ? `${data.planMonths}-month plan` : undefined} /></div>
      <ErrorNote message={err} />
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Payments" actions={canPay && data.stage !== "cancelled" && data.outstandingKobo > 0 ? <RecordPayment transactionId={id} outstandingKobo={data.outstandingKobo} onDone={reload} /> : undefined}>
            <DataTable rows={data.payments} empty="No payments yet." columns={[
              { header: "Reference", cell: (p) => <span className="font-mono text-xs">{p.reference}</span> },
              { header: "Kind", cell: (p) => <span className="capitalize">{p.kind}</span> },
              { header: "Amount", cell: (p) => naira(p.amountKobo) },
              { header: "Date", cell: (p) => fmtDate(p.paidAt ?? p.createdAt) },
              { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
              { header: "", cell: (p) => p.status === "success" ? <Link className="text-brand-600 underline" href={`/admin/receipts/${p.id}`}>Receipt</Link> : null },
            ]} />
          </Card>
          <Card title="History">
            <ul className="space-y-3 text-sm">{data.events.map((e) => <li key={e.id}><b>{STAGE_LABELS[e.stage]}</b> <span className="text-brand-400">· {fmtDate(e.createdAt)}</span>{e.note && <div className="text-brand-600">{e.note}</div>}</li>)}</ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Progress"><StageTimeline steps={data.progress} cancelled={data.stage === "cancelled"} /></Card>
          <Card title="Customer"><div className="text-sm"><Link className="text-brand-600 underline" href={`/admin/customers/${data.customer.id}`}>{data.customer.fullName}</Link><br />{data.customer.email}<br />{data.customer.phone}</div></Card>
          {canWrite && <Card title="Update">
            <div className="space-y-3">
              <Field label="Move to stage"><Select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Choose…</option>{ALL_STAGES.filter((s) => s !== data.stage).map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}</Select></Field>
              <Field label="Note to customer" hint="Included in the notification"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <Button disabled={!stage} onClick={() => patch({ stage, note: note || undefined })}>Update stage</Button>
              <Field label="Agent"><Select value={data.agentId ?? ""} onChange={(e) => patch({ agentId: e.target.value || null })}><option value="">Unassigned</option>{agents.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            </div>
          </Card>}
        </div>
      </div>
    </>
  );
}
