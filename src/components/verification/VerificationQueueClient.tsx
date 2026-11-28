"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  PipelineStepper,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  TrustCheckItem,
  VerificationBadge,
  type PipelineStep,
  type VerificationBadgeState,
} from "@/components/ui";
import { api, fmtDay, naira, useApi } from "@/lib/client";
import { cn } from "@/lib/utils";

type TitleDoc = {
  id: string;
  kind: string;
  title: string;
  status: string;
  sha256Hash: string | null;
  fraudFlag: string | null;
  isSealed: boolean;
  lastVerifiedAt: string | null;
};

type VerificationItem = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  type: string;
  priceKobo: number;
  status: string;
  verified: boolean;
  verificationStatus: "unverified" | "pending_review" | "agent_assigned" | "verified" | "rejected";
  verificationHash: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  agentId: string | null;
  agentName: string | null;
  createdAt: string;
  titleDocs: TitleDoc[];
  hasAgent: boolean;
  hasApprovedTitleDoc: boolean;
  fraudAlertCount: number;
};

type AgentOption = { id: string; name: string; email: string };
type Res = { items: VerificationItem[]; agents: AgentOption[] };

const FILTERS = [
  { id: "all", label: "All Properties" },
  { id: "unverified", label: "Drafts" },
  { id: "pending_review", label: "Pending Review" },
  { id: "agent_assigned", label: "Agent Assigned" },
  { id: "verified", label: "Verified Live" },
  { id: "rejected", label: "Rejected" },
] as const;

function buildSteps(item: VerificationItem): PipelineStep[] {
  const s = item.verificationStatus;
  if (s === "rejected") {
    return [
      { id: "upload", label: "Uploaded", state: "done" },
      { id: "review", label: "Admin Review", state: "error" },
      { id: "agent", label: "Agent Assigned", state: item.hasAgent ? "done" : "pending" },
      { id: "title", label: "Title Sealed", state: item.hasApprovedTitleDoc ? "done" : "pending" },
      { id: "live", label: "Verified Live", state: "pending" },
    ];
  }
  return [
    { id: "upload", label: "Uploaded", state: "done" },
    {
      id: "review",
      label: "Admin Review",
      state: s === "unverified" ? "current" : "done",
    },
    {
      id: "agent",
      label: "Agent Assigned",
      state: item.hasAgent ? "done" : s === "pending_review" ? "current" : "pending",
    },
    {
      id: "title",
      label: "Title Sealed",
      state: item.hasApprovedTitleDoc ? "done" : item.hasAgent ? "current" : "pending",
    },
    {
      id: "live",
      label: "Verified Live",
      state: s === "verified" ? "done" : item.hasAgent && item.hasApprovedTitleDoc ? "current" : "pending",
    },
  ];
}

export default function VerificationQueueClient() {
  const { data, loading, error, reload } = useApi<Res>("/api/admin/verification");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<VerificationItem | null>(null);
  const [agentId, setAgentId] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [integrityResult, setIntegrityResult] = useState<Record<string, { intact: boolean; msg: string }>>({});

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote message={error} />;

  const items = data?.items ?? [];
  const agents = data?.agents ?? [];
  const filtered = filter === "all" ? items : items.filter((i) => i.verificationStatus === filter);

  async function runVerifyAction(propertyId: string, payload: Record<string, unknown>, successMsg: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api(`/api/admin/properties/${propertyId}/verify`, { body: payload });
      await reload();
      setSelected(null);
      setRejectReason("");
      setNotice({ tone: "ok", text: successMsg });
    } catch (e) {
      setNotice({ tone: "err", text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(false);
    }
  }

  async function checkDocIntegrity(docId: string) {
    try {
      const res = await api<{ intact: boolean; sha256Match: boolean; sealValid: boolean }>(
        `/api/admin/documents/${docId}/verify-integrity`,
        { method: "POST", body: {} },
      );
      setIntegrityResult((prev) => ({
        ...prev,
        [docId]: {
          intact: res.intact,
          msg: res.intact ? "SHA-256 & HMAC Seal Verified Intact" : "TAMPER ALERT: Hash or seal mismatch!",
        },
      }));
    } catch (e) {
      setIntegrityResult((prev) => ({
        ...prev,
        [docId]: { intact: false, msg: e instanceof Error ? e.message : "Verification failed" },
      }));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification & Onboarding Queue"
        subtitle="Enforce due diligence: every listing must have an assigned agent, approved title documents, and a cryptographic seal before going live."
      />

      {notice && (
        <Alert variant={notice.tone === "ok" ? "success" : "destructive"} title={notice.tone === "ok" ? "Success" : "Blocked"}>
          {notice.text}
        </Alert>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? items.length : items.filter((i) => i.verificationStatus === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-brand-700 bg-brand-900 text-white"
                  : "border-border bg-white text-foreground hover:bg-muted/50",
              )}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <DataTable
        rows={filtered}
        onRowClick={(r) => {
          setSelected(r);
          setAgentId(r.agentId ?? agents[0]?.id ?? "");
          setRejectReason("");
          setNotice(null);
        }}
        empty="No properties in this verification stage."
        columns={[
          {
            header: "Property",
            cell: (r) => (
              <div>
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.city}, {r.state} · {naira(r.priceKobo)}
                </div>
              </div>
            ),
          },
          {
            header: "Verification Stage",
            cell: (r) => <VerificationBadge state={r.verificationStatus as VerificationBadgeState} />,
          },
          {
            header: "Assigned Agent",
            cell: (r) =>
              r.agentName ? (
                <span className="inline-flex items-center gap-1 text-sm text-foreground">
                  <UserCheck className="size-3.5 text-brand-700" /> {r.agentName}
                </span>
              ) : (
                <span className="text-xs text-amber-700">Unassigned</span>
              ),
          },
          {
            header: "Title Documents",
            cell: (r) => (
              <div className="flex items-center gap-1.5">
                {r.hasApprovedTitleDoc ? (
                  <VerificationBadge state="sealed" label={`${r.titleDocs.length} Sealed`} />
                ) : (
                  <Badge tone="amber">{r.titleDocs.length} Uploaded (Unsealed)</Badge>
                )}
                {r.fraudAlertCount > 0 && <VerificationBadge state="tampered" />}
              </div>
            ),
          },
          { header: "Market Status", cell: (r) => <StatusBadge value={r.status} /> },
          { header: "Added", cell: (r) => fmtDay(r.createdAt) },
        ]}
      />

      {/* Review Drawer / Modal */}
      <Modal
        wide
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Verify: ${selected.name}` : ""}
      >
        {selected && (
          <div className="space-y-6">
            <PipelineStepper steps={buildSteps(selected)} />

            {selected.verificationHash && (
              <div className="flex items-center justify-between rounded-sm border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 font-medium text-emerald-900">
                  <ShieldCheck className="size-4 text-emerald-700" />
                  Public Verification Fingerprint
                </div>
                <code className="font-mono text-emerald-800">{selected.verificationHash}</code>
              </div>
            )}

            {/* Trust Checklist */}
            <div className="grid gap-3 rounded-sm border border-border bg-muted/20 p-4 sm:grid-cols-3">
              <TrustCheckItem
                ok={selected.hasAgent}
                label="Agent Assigned"
                detail={selected.agentName ?? "Assign a company agent below"}
              />
              <TrustCheckItem
                ok={selected.hasApprovedTitleDoc}
                label="Sealed Title Document"
                detail={
                  selected.hasApprovedTitleDoc
                    ? "Approved & HMAC-SHA256 sealed"
                    : "Requires approved C of O / Deed / Survey"
                }
              />
              <TrustCheckItem
                ok={selected.fraudAlertCount === 0}
                label="Anti-Fraud Integrity"
                detail={selected.fraudAlertCount === 0 ? "No duplicate or tampered files" : "Fraud flag detected!"}
              />
            </div>

            {/* Step 1: Agent Assignment */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Assign Verification / Sales Agent
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[240px] flex-1">
                  <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    <option value="">Select active sales agent...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.email})
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  disabled={!agentId || busy}
                  onClick={() =>
                    void runVerifyAction(
                      selected.id,
                      { action: "assign_agent", agentId },
                      "Agent assigned and notified.",
                    )
                  }
                >
                  <UserCheck className="size-4" /> Assign Agent
                </Button>
              </div>
            </div>

            {/* Step 2: Title Documents & Cryptographic Audit */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Title Documents &amp; Cryptographic Integrity
                </div>
                <Link
                  href={`/admin/documents?propertyId=${selected.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  Manage in Vault <ExternalLink className="size-3" />
                </Link>
              </div>
              {selected.titleDocs.length === 0 ? (
                <p className="rounded-sm border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No title documents uploaded yet. Upload a C of O, Governor&apos;s Consent, Deed, or Survey Plan in the Document Vault.
                </p>
              ) : (
                <div className="space-y-2">
                  {selected.titleDocs.map((d) => {
                    const check = integrityResult[d.id];
                    return (
                      <div
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-white p-3 text-sm"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-medium text-foreground">
                            {d.title}
                            <StatusBadge value={d.status} />
                            {d.isSealed && (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                <Lock className="size-3" /> Sealed
                              </span>
                            )}
                            {d.fraudFlag && (
                              <span className="inline-flex items-center gap-1 text-xs text-accent-700">
                                <ShieldAlert className="size-3" /> {d.fraudFlag}
                              </span>
                            )}
                          </div>
                          {d.sha256Hash && (
                            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              SHA-256: {d.sha256Hash.slice(0, 24)}...
                            </div>
                          )}
                          {check && (
                            <div
                              className={cn(
                                "mt-1 text-xs font-medium",
                                check.intact ? "text-emerald-700" : "text-accent-700",
                              )}
                            >
                              {check.msg}
                            </div>
                          )}
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => void checkDocIntegrity(d.id)}>
                          Verify Bytes &amp; Seal
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3: Final Decision */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Final Verification Decision
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.verificationStatus === "unverified" && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void runVerifyAction(selected.id, { action: "submit_review" }, "Submitted for admin review.")
                    }
                  >
                    Move to Pending Review
                  </Button>
                )}
                <Button
                  disabled={busy || !selected.hasAgent || !selected.hasApprovedTitleDoc}
                  onClick={() =>
                    void runVerifyAction(
                      selected.id,
                      { action: "verify", publishNow: true },
                      "Property verified, sealed, and published live!",
                    )
                  }
                >
                  <CheckCircle2 className="size-4" /> Verify &amp; Publish Live
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !selected.hasAgent || !selected.hasApprovedTitleDoc}
                  onClick={() =>
                    void runVerifyAction(
                      selected.id,
                      { action: "verify", publishNow: false },
                      "Property marked verified (kept in current status).",
                    )
                  }
                >
                  Verify Only
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <Field label="Rejection Reason (if rejecting)">
                    <Textarea
                      rows={2}
                      placeholder="Describe missing or invalid documentation..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </Field>
                </div>
                <Button
                  variant="danger"
                  disabled={busy || rejectReason.trim().length < 5}
                  onClick={() =>
                    void runVerifyAction(
                      selected.id,
                      { action: "reject", reason: rejectReason },
                      "Property verification rejected.",
                    )
                  }
                >
                  <XCircle className="size-4" /> Reject
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
