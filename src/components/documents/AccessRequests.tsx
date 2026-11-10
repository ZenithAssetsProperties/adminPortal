"use client";
import { useState } from "react";
import { Button, DataTable, ErrorNote, Select, Spinner, StatusBadge } from "@/components/ui";
import { api, fmtDate, useApi } from "@/lib/client";
import { kindLabel } from "./shared";

type Row = { id: string; status: string; createdAt: string; documentTitle: string; documentKind: string; customerName: string; customerEmail: string };

export default function AccessRequests({ canDecide }: { canDecide: boolean }) {
  const [status, setStatus] = useState("pending");
  const { data, loading, error, reload } = useApi<{ items: Row[] }>(`/api/admin/documents/access?pageSize=50&status=${status}`);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (id: string, decision: "approve" | "deny") => { setErr(null); try { await api(`/api/admin/documents/access/${id}`, { body: { decision } }); await reload(); } catch (e) { setErr((e as Error).message); } };

  return (
    <div>
      <div className="mb-4 max-w-xs"><Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Request status"><option value="pending">Waiting for a decision</option><option value="approved">Approved</option><option value="denied">Denied</option></Select></div>
      <ErrorNote message={error ?? err} />
      {loading && !data ? <Spinner /> : (
        <DataTable rows={data?.items ?? []} empty="No requests here."
          columns={[
            { header: "Buyer", cell: (r) => <div><div className="font-medium">{r.customerName}</div><div className="text-xs text-brand-400">{r.customerEmail}</div></div> },
            { header: "Document", cell: (r) => <div>{r.documentTitle}<div className="text-xs text-brand-400">{kindLabel(r.documentKind)}</div></div> },
            { header: "Asked", cell: (r) => fmtDate(r.createdAt) },
            { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
            { header: "", cell: (r) => canDecide && r.status === "pending" ? <div className="flex gap-2"><Button onClick={() => decide(r.id, "approve")}>Approve</Button><Button variant="secondary" onClick={() => decide(r.id, "deny")}>Deny</Button></div> : null },
          ]} />
      )}
    </div>
  );
}
