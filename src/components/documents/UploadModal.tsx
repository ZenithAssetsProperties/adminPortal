"use client";

import { useState } from "react";
import { FileCheck2, Lock, UploadCloud } from "lucide-react";
import { Button, ErrorNote, Field, Input, Modal, Select } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import CustomerPicker from "./CustomerPicker";
import { KIND_LABELS, fmtSize } from "./shared";
import { cn } from "@/lib/utils";

const TITLE_KINDS = new Set([
  "certificate_of_occupancy",
  "governors_consent",
  "deed_of_assignment",
  "survey_plan",
  "allocation_letter",
  "title_document",
]);

export default function UploadModal({
  open,
  onClose,
  onDone,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  defaultPropertyId?: string;
}) {
  const props = useApi<{ items: { id: string; name: string }[] }>(open ? "/api/admin/properties?pageSize=100" : null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("survey_plan");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [visibility, setVisibility] = useState("request_only");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [registryRef, setRegistryRef] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isTitleDoc = TITLE_KINDS.has(kind);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Choose a file first");
    if (isTitleDoc && propertyId && (!issuingAuthority.trim() || !registryRef.trim())) {
      return setError("Title documents attached to a property require Issuing Authority and Registry Reference.");
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title);
      fd.set("kind", kind);
      fd.set("visibility", visibility);
      if (propertyId) fd.set("propertyId", propertyId);
      if (customerId) fd.set("customerId", customerId);
      if (issuingAuthority.trim()) fd.set("issuingAuthority", issuingAuthority.trim());
      if (registryRef.trim()) fd.set("registryRef", registryRef.trim());
      if (issuedDate) fd.set("issuedDate", issuedDate);

      await api("/api/admin/documents", { body: fd });
      setTitle("");
      setFile(null);
      setCustomerId("");
      setIssuingAuthority("");
      setRegistryRef("");
      setIssuedDate("");
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload & Register Document" wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 rounded-sm border border-brand-200 bg-brand-50/60 px-3 py-2 text-xs text-brand-900">
          <Lock className="size-4 shrink-0 text-brand-700" />
          <span>
            Every upload undergoes structural validation, SHA-256 fingerprinting, and cross-property duplicate detection.
          </span>
        </div>

        <Field label="Document Title">
          <Input
            required
            minLength={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Certificate of Occupancy — Lekki Phase 1 Plot 12"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Document Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility" hint="Buyers only ever see vetted & approved documents">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="request_only">Request access first</option>
              <option value="customer_only">Assigned customer only</option>
              <option value="public">Everyone</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">No property</option>
              {props.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer (optional)">
            <CustomerPicker value={customerId} onChange={setCustomerId} />
          </Field>
        </div>

        {/* Registry Verification Metadata (Required for Title Docs on Properties) */}
        <div className="rounded-sm border border-border bg-muted/20 p-3.5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Registry &amp; Authenticity Metadata {isTitleDoc && propertyId ? "(Required for Title Docs)" : "(Optional)"}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Issuing Authority">
              <Input
                required={Boolean(isTitleDoc && propertyId)}
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                placeholder="e.g. Lagos State Land Registry"
              />
            </Field>
            <Field label="Registry / File Ref #">
              <Input
                required={Boolean(isTitleDoc && propertyId)}
                value={registryRef}
                onChange={(e) => setRegistryRef(e.target.value)}
                placeholder="e.g. CO-LAG-2026-8841"
              />
            </Field>
            <Field label="Issue Date">
              <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center rounded-sm border-2 border-dashed p-6 text-center transition-colors",
            dragOver ? "border-brand-600 bg-brand-50/50" : "border-border bg-white",
          )}
        >
          {file ? (
            <div className="flex flex-col items-center gap-1.5">
              <FileCheck2 className="size-8 text-emerald-600" />
              <div className="text-sm font-medium text-foreground">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {fmtSize(file.size)} · {file.type || "Unknown MIME"}
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="mt-1 text-xs font-medium text-accent-700 underline"
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <>
              <UploadCloud className="size-8 text-brand-500" />
              <p className="mt-2 text-sm font-medium text-foreground">Drag and drop PDF, JPG, or PNG here</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Maximum 15 MB · Verified by magic bytes &amp; EOF check</p>
              <label className="mt-3 cursor-pointer rounded-sm border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                Browse Files
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
            </>
          )}
        </div>

        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Upload &amp; Run Intake Scan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
