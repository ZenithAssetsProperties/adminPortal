"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Button,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  VerificationBadge,
} from "@/components/ui";
import { api, fmtDate, useApi } from "@/lib/client";
import CustomerPicker from "./CustomerPicker";
import { fmtSize, kindLabel } from "./shared";

type Ver = {
  id: string;
  version: number;
  status: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  approvedAt: string | null;
};

type VettingLog = {
  id: string;
  stage: string;
  passed: boolean;
  notes: string | null;
  createdAt: string;
  reviewerName: string | null;
};

type Detail = {
  document: {
    id: string;
    title: string;
    kind: string;
    status: string;
    visibility: string;
    mimeType: string;
    propertyName: string | null;
    customerId: string | null;
    customerName: string | null;
    customerEmail: string | null;
    uploaderName?: string | null;
    previewUrl?: string;
    version: number;
    sha256Hash?: string | null;
    integritySeal?: string | null;
    fraudFlag?: string | null;
    issuingAuthority?: string | null;
    registryRef?: string | null;
    issuedDate?: string | null;
    rejectionReason?: string | null;
    vettingChecklist?: {
      registryVerified: boolean;
      ownerNameMatches: boolean;
      boundariesClear: boolean;
      noEncumbrance: boolean;
    } | null;
  };
  versions: Ver[];
  vettingLogs?: VettingLog[];
};

const TITLE_KINDS = new Set([
  "certificate_of_occupancy",
  "governors_consent",
  "deed_of_assignment",
  "survey_plan",
  "allocation_letter",
  "title_document",
]);

export default function DocumentDrawer({
  id,
  onClose,
  onChanged,
  perms,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
  perms: string[];
}) {
  const { data, loading, error, reload } = useApi<Detail>(id ? `/api/admin/documents/${id}` : null);
  const [err, setErr] = useState<string | null>(null);
  const [assign, setAssign] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [integrityMsg, setIntegrityMsg] = useState<{ intact: boolean; text: string } | null>(null);
  const [checklist, setChecklist] = useState({
    registryVerified: false,
    ownerNameMatches: false,
    boundariesClear: false,
    noEncumbrance: false,
  });
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const canWrite = perms.includes("documents.write");
  const canApprove = perms.includes("documents.approve");
  const d = data?.document;

  const run = async (fn: () => Promise<unknown>, closeAfter = false) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      onChanged();
      if (closeAfter) onClose();
      else await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = (versionId: string) =>
    run(async () => {
      const r = await api<{ url: string }>(`/api/admin/documents/${versionId}/download`);
      window.open(r.url, "_blank", "noopener");
    });

  const newVersion = () =>
    run(async () => {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error("Choose the new file first");
      const fd = new FormData();
      fd.set("file", f);
      await api(`/api/admin/documents/${id}/versions`, { body: fd });
      if (fileRef.current) fileRef.current.value = "";
    });

  const isTitleDoc = d ? TITLE_KINDS.has(d.kind) : false;
  const allChecked =
    checklist.registryVerified &&
    checklist.ownerNameMatches &&
    checklist.boundariesClear &&
    checklist.noEncumbrance;

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={d ? `Vetting Workbench: ${d.title}` : "Document"} wide>
      {loading && !data ? (
        <Spinner />
      ) : !d ? (
        <ErrorNote message={error} />
      ) : (
        <div className="space-y-5">
          {/* Status & Seals Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={d.status} />
              {d.integritySeal && <VerificationBadge state="sealed" />}
              {d.fraudFlag && <VerificationBadge state="tampered" />}
              <span className="font-medium text-foreground">{kindLabel(d.kind)}</span>
              <span className="text-muted-foreground">· v{d.version}</span>
              {d.propertyName && <span className="text-brand-700">· {d.propertyName}</span>}
              {d.uploaderName && <span className="text-xs text-muted-foreground">· Uploaded by {d.uploaderName}</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => download(d.id)}>
                <Download className="size-3.5" /> Open Full File
              </Button>
              {canApprove && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    confirm("Delete this document and ALL its versions? This cannot be undone.") &&
                    run(() => api(`/api/admin/documents/${d.id}`, { method: "DELETE" }), true)
                  }
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              )}
            </div>
          </div>

          <ErrorNote message={err} />

          {/* Split-Pane Workbench: Inline Preview + Vetting Controls */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Left Pane: Inline Document Viewer */}
            <div className="flex flex-col rounded-sm border border-border bg-muted/20">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Document Preview ({d.mimeType})</span>
                {d.previewUrl && (
                  <a
                    href={d.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    Pop out <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <div className="flex min-h-[320px] flex-1 items-center justify-center p-2">
                {!d.previewUrl ? (
                  <span className="text-xs text-muted-foreground">Preview unavailable</span>
                ) : d.mimeType === "application/pdf" ? (
                  <iframe
                    src={d.previewUrl}
                    title={d.title}
                    className="h-[340px] w-full rounded-sm border border-border bg-white"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.previewUrl}
                    alt={d.title}
                    className="max-h-[340px] w-auto rounded-sm object-contain"
                  />
                )}
              </div>
            </div>

            {/* Right Pane: Registry Metadata, Crypto Check & 4-Point Vetting */}
            <div className="space-y-4">
              {/* Registry & Crypto Box */}
              <div className="rounded-sm border border-border bg-white p-3.5 text-xs space-y-2">
                <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                  Registry &amp; Cryptographic Fingerprint
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Authority:</span>{" "}
                    <span className="font-medium text-foreground">{d.issuingAuthority ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Registry Ref:</span>{" "}
                    <span className="font-mono font-medium text-foreground">{d.registryRef ?? "—"}</span>
                  </div>
                </div>
                {d.sha256Hash && (
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Lock className="size-3.5 shrink-0 text-brand-700" />
                      <code className="truncate font-mono text-[11px] text-muted-foreground">{d.sha256Hash}</code>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const r = await api<{ intact: boolean }>(`/api/admin/documents/${d.id}/verify-integrity`, {
                            method: "POST",
                            body: {},
                          });
                          setIntegrityMsg({
                            intact: r.intact,
                            text: r.intact
                              ? "Live byte check passed: 100% intact."
                              : "TAMPER ALERT: bytes do not match SHA-256 or HMAC seal!",
                          });
                          await reload();
                        } catch (e) {
                          setErr((e as Error).message);
                        }
                      }}
                      className="shrink-0 font-semibold text-brand-700 underline"
                    >
                      Verify Bytes
                    </button>
                  </div>
                )}
                {integrityMsg && (
                  <div
                    className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-medium ${
                      integrityMsg.intact ? "bg-emerald-50 text-emerald-800" : "bg-accent-50 text-accent-800"
                    }`}
                  >
                    {integrityMsg.intact ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                    {integrityMsg.text}
                  </div>
                )}
              </div>

              {/* 4-Point Legal Vetting Checklist */}
              {canApprove && d.status !== "approved" && (
                <div className="rounded-sm border border-brand-200 bg-brand-50/30 p-3.5 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand-900">
                    Legal &amp; Authenticity Vetting Checklist
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      { key: "registryVerified", label: "Registry / File Reference verified against issuing authority" },
                      { key: "ownerNameMatches", label: "Owner / Grantor name matches seller & property record" },
                      { key: "boundariesClear", label: "Survey coordinates / plot boundaries match listing" },
                      { key: "noEncumbrance", label: "No caveats, liens, or litigation flags found" },
                    ].map((item) => (
                      <label key={item.key} className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-3.5 accent-brand-700"
                          checked={checklist[item.key as keyof typeof checklist]}
                          onChange={(e) =>
                            setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                          }
                        />
                        <span className="text-foreground">{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <Input
                    placeholder="Optional reviewer note (recorded in audit trail)..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy || (isTitleDoc && !allChecked)}
                      onClick={() =>
                        run(() =>
                          api(`/api/admin/documents/${d.id}/review`, {
                            body: { decision: "approve", checklist, reviewNotes: reviewNotes || undefined },
                          }),
                        )
                      }
                    >
                      <CheckCircle2 className="size-3.5" /> Approve &amp; Seal
                    </Button>
                  </div>

                  {/* Rejection Box */}
                  <div className="border-t border-border pt-2.5 space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Mandatory rejection reason (min 10 chars)..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || rejectionReason.trim().length < 10}
                      onClick={() =>
                        run(() =>
                          api(`/api/admin/documents/${d.id}/review`, {
                            body: { decision: "reject", rejectionReason: rejectionReason.trim() },
                          }),
                        )
                      }
                    >
                      <XCircle className="size-3.5" /> Reject Document
                    </Button>
                  </div>
                </div>
              )}

              {d.status === "rejected" && d.rejectionReason && (
                <div className="rounded-sm border border-accent-200 bg-accent-50 p-3 text-xs text-accent-800">
                  <strong>Rejection Reason:</strong> {d.rejectionReason}
                </div>
              )}
            </div>
          </div>

          {/* Metadata Edit & Audience Controls */}
          {canWrite && (
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <Field label="Title">
                <div className="flex gap-2">
                  <Input value={title ?? d.title} onChange={(e) => setTitle(e.target.value)} />
                  <Button
                    variant="secondary"
                    disabled={title === null || title === d.title}
                    onClick={() => run(() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { title } }))}
                  >
                    Save
                  </Button>
                </div>
              </Field>
              <Field label="Who can see it">
                <Select
                  value={d.visibility}
                  onChange={(e) =>
                    run(() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { visibility: e.target.value } }))
                  }
                >
                  <option value="request_only">Request access first</option>
                  <option value="customer_only">Assigned customer only</option>
                  <option value="public">Everyone</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label={d.customerName ? `Assigned to ${d.customerName}` : "Assign to a customer"}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <CustomerPicker value={assign} onChange={setAssign} />
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!assign}
                      onClick={() =>
                        run(async () => {
                          await api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { customerId: assign } });
                          setAssign("");
                        })
                      }
                    >
                      Assign
                    </Button>
                    {d.customerId && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          run(() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: { customerId: null } }))
                        }
                      >
                        Unassign
                      </Button>
                    )}
                  </div>
                </Field>
              </div>
            </div>
          )}

          {/* Vetting Audit Trail & Version History */}
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-base font-heading text-foreground">Vetting Audit Trail</h3>
              {!data.vettingLogs?.length ? (
                <p className="text-xs text-muted-foreground">No vetting events logged yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-sm border border-border text-xs">
                  {data.vettingLogs.map((log) => (
                    <li key={log.id} className="px-3 py-2">
                      <div className="flex items-center justify-between font-medium">
                        <span className={log.passed ? "text-emerald-800" : "text-accent-700"}>
                          {log.stage.replaceAll("_", " ").toUpperCase()}
                        </span>
                        <span className="text-muted-foreground">{fmtDate(log.createdAt)}</span>
                      </div>
                      {log.notes && <div className="mt-0.5 text-muted-foreground">{log.notes}</div>}
                      {log.reviewerName && <div className="mt-0.5 text-[11px] text-brand-700">By {log.reviewerName}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-base font-heading text-foreground">Version History</h3>
              <ul className="divide-y divide-border rounded-sm border border-border text-xs">
                {data.versions.map((v, i) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      <strong>v{v.version}</strong>
                      {i === 0 && <span className="ml-1.5 text-brand-600">current</span>} · {fmtSize(v.sizeBytes)}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge value={v.status} />
                      <button className="text-brand-700 underline" onClick={() => download(v.id)}>
                        Open
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="text-xs"
                    aria-label="New version file"
                  />
                  <Button size="sm" variant="secondary" onClick={newVersion}>
                    Upload New Version
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
