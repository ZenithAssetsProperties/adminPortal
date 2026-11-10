"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button, Card, DataTable, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { api, fmtDay, useApi } from "@/lib/client";

type Row = { id: string; propertyName: string; name: string; phone: string; email: string | null; kind: string; status: string; preferredDate: string; preferredTime: string; visitors: number; specialRequest: string | null; staffNote: string | null; assignedTo: string | null };

export default function InspectionsPage() {
  const [status, setStatus] = useState(""); const [kind, setKind] = useState(""); const [q, setQ] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(status && { status }), ...(kind && { kind }), ...(q && { q }), ...(from && { from }), ...(to && { to }) }).toString();
  const { data, loading, error, reload } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/inspections?${qs}`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const staffList = useApi<{ items: { id: string; name: string }[] }>("/api/admin/agents?pageSize=100&active=1");
  const canWrite = me.data?.permissions.includes("inspections.write") ?? false;
  const [open, setOpen] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState(""); const [time, setTime] = useState(""); const [note, setNote] = useState(""); const [assignee, setAssignee] = useState("");
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function openRow(r: Row) { setOpen(r); setDate(r.preferredDate); setTime(r.preferredTime); setNote(r.staffNote ?? ""); setAssignee(r.assignedTo ?? ""); setErr(null); }
  async function patch(body: object) {
    setErr(null);
    try { const u = await api<Row>(`/api/admin/inspections/${open!.id}`, { method: "PATCH", body }); setOpen({ ...open!, ...u }); await reload(); } catch (e) { setErr((e as Error).message); }
  }
  const final = open && ["completed", "cancelled"].includes(open.status);

  return (
    <>
      <PageHeader title="Inspections" subtitle={data ? `${data.total} requests` : undefined} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2"><Search className="absolute left-3 top-2.5 size-4 text-brand-300" /><Input className="pl-9" placeholder="Search name, phone or property" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["requested", "confirmed", "completed", "cancelled"].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select aria-label="Kind" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">Physical & virtual</option><option>physical</option><option>virtual</option></Select>
          <div className="flex gap-2"><Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /><Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : <DataTable rows={data?.items ?? []} onRowClick={openRow} empty="No inspections match."
          columns={[
            { header: "When", cell: (r) => <div><div className="font-medium">{fmtDay(r.preferredDate)}</div><div className="text-xs text-brand-400">{r.preferredTime}</div></div> },
            { header: "Visitor", cell: (r) => <div><div>{r.name}</div><div className="text-xs text-brand-400">{r.phone}</div></div> },
            { header: "Property", cell: (r) => r.propertyName },
            { header: "Kind", cell: (r) => <span className="capitalize">{r.kind}</span> },
            { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
          ]} />}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </Card>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title="Inspection request">
        {open && <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2"><div><b>{open.name}</b><br />{open.phone}<br />{open.email}</div><div>{open.propertyName}<br />{open.visitors} visitor(s)<br /><StatusBadge value={open.status} /></div></div>
          {open.specialRequest && <p className="border border-line bg-paper p-3">{open.specialRequest}</p>}
          <ErrorNote message={err} />
          {canWrite && !final && <>
            <div className="flex flex-wrap gap-2">
              {open.status === "requested" && <Button onClick={() => patch({ action: "confirm" })}>Confirm</Button>}
              {open.status === "confirmed" && <Button onClick={() => patch({ action: "complete" })}>Mark completed</Button>}
              <Button variant="danger" onClick={() => confirm("Cancel this inspection? The visitor is notified.") && patch({ action: "cancel" })}>Cancel</Button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><Field label="New date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="New time"><Input value={time} onChange={(e) => setTime(e.target.value)} /></Field><Button variant="secondary" onClick={() => patch({ action: "reschedule", preferredDate: date, preferredTime: time })}>Reschedule</Button></div>
          </>}
          {canWrite && <>
            <Field label="Assigned to"><Select value={assignee} onChange={(e) => { setAssignee(e.target.value); void patch({ assignedTo: e.target.value || null }); }}><option value="">Unassigned</option>{staffList.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Staff note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <Button variant="secondary" onClick={() => patch({ staffNote: note })}>Save note</Button>
          </>}
        </div>}
      </Modal>
    </>
  );
}
