"use client";
import { useRef, useState } from "react";
import { Download, Lock, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Button, ErrorNote, Field, Modal, Select, Spinner, StatusBadge, Input, VerificationBadge } from "@/components/ui";
import { api, fmtDate, useApi } from "@/lib/client";
import CustomerPicker from "./CustomerPicker";
import { fmtSize, kindLabel } from "./shared";

type Ver = { id: string; version: number; status: string; sizeBytes: number; mimeType: string; createdAt: string; approvedAt: string | null };
type Detail = {
  document: {
    id: string; title: string; kind: string; status: string; visibility: string;
    propertyName: string | null; customerId: string | null; customerName: string | null; customerEmail: string | null;
    version: number; sha256Hash?: string | null; integritySeal?: string | null; fraudFlag?: string | null;
  };
  versions: Ver[];
};

export default function DocumentDrawer({ id, onClose, onChanged, perms }: { id: string | null; onClose: () => void; onChanged: () => void; perms: string[] }) {
  const { data, loading, error, reload } = useApi<Detail>(id ? `/api/admin/documents/${id}` : null);
  const [err, setErr] = useState<string | null>(null);
  const [assign, setAssign] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [integrityMsg, setIntegrityMsg] = useState<{ intact: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canWrite = perms.includes("documents.write"); const canApprove = perms.includes("documents.approve");
  const d = data?.document;

  const run = async (fn: () => Promise<unknown>, closeAfter = false) => {
    setErr(null);
    try { await fn(); onChanged(); if (closeAfter) onClose(); else await reload(); } catch (e) { setErr((e as Error).message); }
  };
  const download = (versionId: string) => run(async () => { const r = await api<{ url: string }>(`/api/admin/documents/${versionId}/download`); window.open(r.url, "_blank", "noopener"); });
  const newVersion = () => run(async () => {
    const f = fileRef.current?.files?.[0]; if (!f) throw new Error("Choose the new file first");
    const fd = new FormData(); fd.set("file", f); await api(`/api/admin/documents/${id}/versions`, { body: fd }); if (fileRef.current) fileRef.current.value = "";
  });

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={d?.title ?? "Document"} wide>
      {loading && !data ? <Spinner /> : !d ? <ErrorNote message={error} /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge value={d.status} />
            {d.integritySeal && <VerificationBadge state="sealed" />}
            {d.fraudFlag && <VerificationBadge state="tampered" />}
            <span>{kindLabel(d.kind)}</span><span className="text-brand-400">· version {d.version}</span>
            {d.propertyName && <span className="text-brand-500">· {d.propertyName}</span>}
            {d.customerName && <span className="text-brand-500">· {d.customerName}</span>}
          </div>
          {d.sha256Hash && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Lock className="size-3.5 text-brand-700" />
                <span className="font-medium text-foreground">SHA-256:</span>
                <code className="font-mono text-muted-foreground">{d.sha256Hash}</code>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await api<{ intact: boolean }>(`/api/admin/documents/${d.id}/verify-integrity`, { method: "POST", body: {} });
                    setIntegrityMsg({ intact: r.intact, text: r.intact ? "Live byte check passed: document is 100% intact." : "TAMPER ALERT: stored bytes do not match SHA-256 or HMAC seal!" });
                    await reload();
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
                className="font-medium text-brand-700 underline"
              >
                Verify Integrity
              </button>
            </div>
          )}
          {integrityMsg && (
            <div className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-xs font-medium ${integrityMsg.intact ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-accent-200 bg-accent-50 text-accent-800"}`}>
              {integrityMsg.intact ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
              {integrityMsg.text}
            </div>
          )}
          <ErrorNote message={err} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => download(d.id)}><Download className="size-4" /> View / download</Button>
            {canApprove && d.status !== "approved" && <Button onClick={() => run(() => api(`/api/admin/documents/${d.id}/review`, { body: { decision: "approve" } }))}>Approve</Button>}
            {canApprove && d.status !== "rejected" && <Button variant="secondary" onClick={() => run(() => api(`/api/admin/documents/${d.id}/review`, { body: { decision: "reject" } }))}>Reject</Button>}
            {canApprove && <Button variant="danger" onClick={() => confirm("Delete this document and ALL its versions? This cannot be undone.") && run(() => api(`/api/admin/documents/${d.id}`, { method: "DELETE" }), true)}><Trash2 className="size-4" /> Delete</Button>}
          </div>

          {canWrite && (
            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <Field label="Title"><div className="flex gap-2"><Input value={title ?? d.title} onChange={(e) => setTitle(e.target.value)} /><Button variant="secondary" disabled={title === null || title === d.title} onClick={() => run(() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { title } }))}>Save</Button></div></Field>
              <Field label="Who can see it"><Select value={d.visibility} onChange={(e) => run(() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { visibility: e.target.value } }))}>
                <option value="request_only">Request access first</option><option value="customer_only">Assigned customer only</option><option value="public">Everyone</option></Select></Field>
              <div className="sm:col-span-2"><Field label={d.customerName ? `Assigned to ${d.customerName}` : "Assign to a customer"}>
                <div className="flex items-start gap-2"><div className="flex-1"><CustomerPicker value={assign} onChange={setAssign} /></div>
                  <Button variant="secondary" disabled={!assign} onClick={() => run(async () => { await api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { customerId: assign } }); setAssign(""); })}>Assign</Button>
                  {d.customerId && <Button variant="ghost" onClick={() => run(() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { customerId: null } }))}>Unassign</Button>}</div></Field></div>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-xl text-brand-900">Version history</h3>
            <ul className="divide-y divide-line border border-line text-sm">
              {data!.versions.map((v, i) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span><strong>v{v.version}</strong>{i === 0 && <span className="ml-2 text-xs text-brand-500">current</span>} · {fmtDate(v.createdAt)} · {fmtSize(v.sizeBytes)}</span>
                  <span className="flex items-center gap-2"><StatusBadge value={v.status} /><button className="text-brand-600 underline" onClick={() => download(v.id)}>Open</button></span>
                </li>
              ))}
            </ul>
            {canWrite && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" aria-label="New version file" />
                <Button variant="secondary" onClick={newVersion}>Upload new version</Button>
                <span className="text-xs text-brand-400">The new version starts as pending and needs approval.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
