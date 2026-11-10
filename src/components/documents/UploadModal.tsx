"use client";
import { useState } from "react";
import { Button, ErrorNote, Field, Input, Modal, Select } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import CustomerPicker from "./CustomerPicker";
import { KIND_LABELS } from "./shared";

export default function UploadModal({ open, onClose, onDone, defaultPropertyId }: { open: boolean; onClose: () => void; onDone: () => void; defaultPropertyId?: string }) {
  const props = useApi<{ items: { id: string; name: string }[] }>(open ? "/api/admin/properties?pageSize=100" : null);
  const [title, setTitle] = useState(""); const [kind, setKind] = useState("survey_plan");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? ""); const [customerId, setCustomerId] = useState("");
  const [visibility, setVisibility] = useState("request_only"); const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!file) return setError("Choose a file first");
    setBusy(true);
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("title", title); fd.set("kind", kind); fd.set("visibility", visibility);
      if (propertyId) fd.set("propertyId", propertyId); if (customerId) fd.set("customerId", customerId);
      await api("/api/admin/documents", { body: fd });
      setTitle(""); setFile(null); setCustomerId(""); onDone(); onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload document">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><Input required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Survey plan — Plot 12" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Document type"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Who can see it" hint="Buyers only ever see approved documents"><Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="request_only">Request access first</option><option value="customer_only">Assigned customer only</option><option value="public">Everyone</option></Select></Field>
        </div>
        <Field label="Property"><Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">No property</option>{props.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Customer (optional)"><CustomerPicker value={customerId} onChange={setCustomerId} /></Field>
        <Field label="File" hint="PDF, JPG or PNG, up to 15 MB"><input type="file" required accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" /></Field>
        <ErrorNote message={error} />
        <div className="flex gap-2"><Button type="submit" loading={busy}>Upload</Button><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button></div>
      </form>
    </Modal>
  );
}
