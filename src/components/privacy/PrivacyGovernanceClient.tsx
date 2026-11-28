"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Download,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Stat,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { usePerms } from "@/components/staff/usePerms";
import { api, fmtDate, fmtDay, useApi } from "@/lib/client";
import {
  PERMISSIONS,
  PII_LEVEL_LABELS,
  ROLE_LABELS,
  type Permission,
  type PiiAccessLevel,
  type Role,
} from "@/lib/rbac";
import { cn } from "@/lib/utils";

type TabId = "overview" | "rbac" | "overrides" | "dsar" | "consents";

type OverviewRes = {
  postureScore: number;
  metrics: {
    openDsars: number;
    overdueDsars: number;
    completedDsars: number;
    totalConsents: number;
    grantedConsents: number;
    consentRate: number;
    activeOverrides: number;
    customPolicies: number;
  };
  settings: PrivacySettings;
  recentAudit: {
    id: string;
    action: string;
    entity: string | null;
    entityId: string | null;
    ip: string | null;
    createdAt: string;
    actorName: string | null;
  }[];
};

type PrivacySettings = {
  id: string;
  auditLogRetentionDays: number;
  inactiveCustomerRetentionDays: number;
  dsarSlaDays: number;
  maskPiiByDefault: boolean;
  enforceIpAllowlist: boolean;
  anonymizeOnErasure: boolean;
  policyVersion: string;
  updatedAt: string;
};

type RolePolicy = {
  role: Role;
  label: string;
  permissions: string[];
  piiAccessLevel: PiiAccessLevel;
  requireMfa: boolean;
  sessionTtlMinutes: number;
  allowedIpCidrs: string[];
  description: string | null;
  customized: boolean;
  updatedAt: string | null;
};

type PermissionGroup = {
  group: string;
  items: { perm: Permission; label: string; description: string }[];
};

type OverrideRow = {
  id: string;
  staffId: string;
  staffName: string | null;
  staffEmail: string | null;
  staffRole: Role | null;
  permission: string;
  effect: "allow" | "deny";
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type StaffOption = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

type PoliciesRes = {
  policies: RolePolicy[];
  permissionGroups: PermissionGroup[];
  overrides: OverrideRow[];
  staffList: StaffOption[];
};

type DsarRow = {
  id: string;
  reference: string;
  customerId: string | null;
  subjectEmail: string;
  type: "access" | "erasure" | "rectification" | "restriction" | "portability";
  status: "pending" | "in_review" | "approved" | "completed" | "rejected";
  reason: string | null;
  resolutionNotes: string | null;
  requestedBy: string;
  assignedTo: string | null;
  assignedName: string | null;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
};

type ConsentRow = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  purpose: string;
  granted: boolean;
  policyVersion: string;
  source: string;
  grantedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Compliance Overview" },
  { id: "rbac", label: "RBAC Policy Matrix" },
  { id: "overrides", label: "JIT & Staff Overrides" },
  { id: "dsar", label: "DSAR & Erasure Queue" },
  { id: "consents", label: "Consents & Retention" },
];

export default function PrivacyGovernanceClient() {
  const { can, piiAccessLevel } = usePerms();
  const [tab, setTab] = useState<TabId>("overview");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const overview = useApi<OverviewRes>("/api/admin/privacy/overview");
  const policies = useApi<PoliciesRes>(can("rbac.read") || tab === "rbac" || tab === "overrides" ? "/api/admin/rbac/policies" : null);
  const dsars = useApi<{ items: DsarRow[]; total: number }>(tab === "dsar" ? "/api/admin/privacy/requests?pageSize=50" : null);
  const consents = useApi<{ items: ConsentRow[]; total: number }>(tab === "consents" ? "/api/admin/privacy/consents?pageSize=50" : null);

  function notifyOk(text: string) {
    setNotice({ tone: "ok", text });
  }
  function notifyErr(e: unknown) {
    setNotice({ tone: "err", text: e instanceof Error ? e.message : "Operation failed" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy & RBAC Governance"
        subtitle="Role-based access control, PII masking tiers, customer consents, and GDPR/NDPR data subject requests."
        actions={
          <Badge tone={piiAccessLevel === "full" ? "green" : piiAccessLevel === "masked" ? "amber" : "red"}>
            <EyeOff className="size-3.5" /> Your PII Tier: {PII_LEVEL_LABELS[piiAccessLevel]}
          </Badge>
        }
      />

      {notice && (
        <Alert variant={notice.tone === "ok" ? "success" : "destructive"} title={notice.tone === "ok" ? "Saved" : "Error"}>
          {notice.text}
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setNotice(null);
            }}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-brand-700 text-brand-900"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab overview={overview} />}
      {tab === "rbac" && (
        <RbacMatrixTab
          policiesApi={policies}
          canManage={can("rbac.manage")}
          onOk={(m) => {
            notifyOk(m);
            void overview.reload();
          }}
          onErr={notifyErr}
        />
      )}
      {tab === "overrides" && (
        <OverridesTab
          policiesApi={policies}
          canManage={can("rbac.manage")}
          onOk={(m) => {
            notifyOk(m);
            void overview.reload();
          }}
          onErr={notifyErr}
        />
      )}
      {tab === "dsar" && (
        <DsarTab
          dsarApi={dsars}
          canManage={can("privacy.manage")}
          onOk={(m) => {
            notifyOk(m);
            void overview.reload();
          }}
          onErr={notifyErr}
        />
      )}
      {tab === "consents" && (
        <ConsentsAndRetentionTab
          consentsApi={consents}
          settings={overview.data?.settings ?? null}
          canManage={can("privacy.manage")}
          onOk={(m) => {
            notifyOk(m);
            void overview.reload();
          }}
          onErr={notifyErr}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Overview
// ---------------------------------------------------------------------------

function OverviewTab({ overview }: { overview: ReturnType<typeof useApi<OverviewRes>> }) {
  if (overview.loading && !overview.data) return <Spinner />;
  if (overview.error) return <ErrorNote message={overview.error} />;
  const d = overview.data;
  if (!d) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Compliance Posture"
          value={`${d.postureScore}%`}
          sub={d.postureScore >= 90 ? "Enterprise hardened" : "Review open DSARs or masking"}
        />
        <Stat
          label="Open DSARs"
          value={d.metrics.openDsars}
          sub={`${d.metrics.overdueDsars} overdue · ${d.metrics.completedDsars} completed`}
        />
        <Stat
          label="Consent Opt-In Rate"
          value={`${d.metrics.consentRate}%`}
          sub={`${d.metrics.grantedConsents} of ${d.metrics.totalConsents} records`}
        />
        <Stat
          label="RBAC Customizations"
          value={d.metrics.customPolicies}
          sub={`${d.metrics.activeOverrides} active staff overrides`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-brand-700" />
              Recent Privacy & RBAC Audit Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={d.recentAudit}
              empty="No privacy or RBAC governance events recorded yet."
              columns={[
                { header: "Action", cell: (r) => <Badge tone="blue">{r.action}</Badge> },
                { header: "Actor", cell: (r) => r.actorName ?? "System" },
                { header: "Target", cell: (r) => (r.entity ? `${r.entity} (${r.entityId?.slice(0, 8) ?? "—"})` : "—") },
                { header: "IP", cell: (r) => r.ip ?? "—" },
                { header: "Time", cell: (r) => fmtDate(r.createdAt) },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="size-5 text-brand-700" />
              Active Governance Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Default PII Masking</span>
              <Badge tone={d.settings.maskPiiByDefault ? "green" : "amber"}>
                {d.settings.maskPiiByDefault ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Erasure Mode</span>
              <Badge tone="green">
                {d.settings.anonymizeOnErasure ? "Crypto Anonymize" : "Standard"}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">DSAR SLA Window</span>
              <span className="font-medium">{d.settings.dsarSlaDays} days</span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Audit Retention</span>
              <span className="font-medium">{d.settings.auditLogRetentionDays} days</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Policy Version</span>
              <span className="font-mono text-xs">{d.settings.policyVersion}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: RBAC Policy Matrix
// ---------------------------------------------------------------------------

function RbacMatrixTab({
  policiesApi,
  canManage,
  onOk,
  onErr,
}: {
  policiesApi: ReturnType<typeof useApi<PoliciesRes>>;
  canManage: boolean;
  onOk: (msg: string) => void;
  onErr: (err: unknown) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<Role>("sales_agent");
  const [draftPerms, setDraftPerms] = useState<string[] | null>(null);
  const [draftPii, setDraftPii] = useState<PiiAccessLevel | null>(null);
  const [draftTtl, setDraftTtl] = useState<number | null>(null);
  const [draftMfa, setDraftMfa] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  if (policiesApi.loading && !policiesApi.data) return <Spinner />;
  if (policiesApi.error) return <ErrorNote message={policiesApi.error} />;
  const data = policiesApi.data;
  if (!data) return null;

  const activePolicy = data.policies.find((p) => p.role === selectedRole) ?? data.policies[0];
  const currentPerms = draftPerms ?? activePolicy.permissions;
  const currentPii = draftPii ?? activePolicy.piiAccessLevel;
  const currentTtl = draftTtl ?? activePolicy.sessionTtlMinutes;
  const currentMfa = draftMfa ?? activePolicy.requireMfa;

  function selectRole(role: Role) {
    setSelectedRole(role);
    setDraftPerms(null);
    setDraftPii(null);
    setDraftTtl(null);
    setDraftMfa(null);
  }

  function togglePerm(perm: Permission) {
    if (!canManage) return;
    const set = new Set(currentPerms);
    if (set.has(perm)) set.delete(perm);
    else set.add(perm);
    setDraftPerms(Array.from(set));
  }

  async function savePolicy() {
    setSaving(true);
    try {
      await api(`/api/admin/rbac/policies/${selectedRole}`, {
        method: "PATCH",
        body: {
          permissions: currentPerms,
          piiAccessLevel: currentPii,
          sessionTtlMinutes: currentTtl,
          requireMfa: currentMfa,
        },
      });
      await policiesApi.reload();
      setDraftPerms(null);
      setDraftPii(null);
      setDraftTtl(null);
      setDraftMfa(null);
      onOk(`Updated RBAC & privacy policy for ${ROLE_LABELS[selectedRole]}.`);
    } catch (e) {
      onErr(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {data.policies.map((p) => (
            <button
              key={p.role}
              onClick={() => selectRole(p.role)}
              className={cn(
                "rounded-sm border px-3.5 py-2 text-sm font-medium transition-colors",
                selectedRole === p.role
                  ? "border-brand-700 bg-brand-900 text-white"
                  : "border-border bg-white text-foreground hover:bg-muted/50",
              )}
            >
              {p.label}
              {p.customized && <span className="ml-1.5 text-xs opacity-75">• Custom</span>}
            </button>
          ))}
        </div>
        {canManage && (
          <Button onClick={savePolicy} loading={saving}>
            <CheckCircle2 className="size-4" /> Save {ROLE_LABELS[selectedRole]} Policy
          </Button>
        )}
      </div>

      {/* Role Privacy & Session Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Privacy & Session Enforcement — {ROLE_LABELS[selectedRole]}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="PII Visibility Tier" hint="Controls masking on customer emails, phones, and IPs">
            <Select
              disabled={!canManage}
              value={currentPii}
              onChange={(e) => setDraftPii(e.target.value as PiiAccessLevel)}
            >
              <option value="full">Full (Cleartext)</option>
              <option value="masked">Masked (Partial e.g. j***@domain)</option>
              <option value="redacted">Redacted ([REDACTED])</option>
            </Select>
          </Field>
          <Field label="Session Idle Timeout (Minutes)" hint="5 to 1440 minutes">
            <Input
              type="number"
              min={5}
              max={1440}
              disabled={!canManage}
              value={currentTtl}
              onChange={(e) => setDraftTtl(Number(e.target.value) || 30)}
            />
          </Field>
          <Field label="MFA Enforcement" hint="Require strong multi-factor sign-in">
            <Select
              disabled={!canManage}
              value={currentMfa ? "1" : "0"}
              onChange={(e) => setDraftMfa(e.target.value === "1")}
            >
              <option value="0">Optional</option>
              <option value="1">Required</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* Permission Matrix */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.permissionGroups.map((grp) => (
          <Card key={grp.group}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{grp.group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {grp.items.map((item) => {
                const enabled = currentPerms.includes(item.perm);
                return (
                  <label
                    key={item.perm}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-sm border p-3 transition-colors",
                      enabled ? "border-brand-200 bg-brand-50/40" : "border-border bg-white",
                      canManage ? "cursor-pointer hover:border-brand-300" : "opacity-80",
                    )}
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                      <div className="mt-1 font-mono text-[11px] text-brand-700">{item.perm}</div>
                    </div>
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-brand-700"
                      disabled={!canManage}
                      checked={enabled}
                      onChange={() => togglePerm(item.perm)}
                    />
                  </label>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: JIT & Staff Overrides
// ---------------------------------------------------------------------------

function OverridesTab({
  policiesApi,
  canManage,
  onOk,
  onErr,
}: {
  policiesApi: ReturnType<typeof useApi<PoliciesRes>>;
  canManage: boolean;
  onOk: (msg: string) => void;
  onErr: (err: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    staffId: "",
    permission: PERMISSIONS[0] as string,
    effect: "allow" as "allow" | "deny",
    reason: "",
    expiresHours: "24",
  });

  if (policiesApi.loading && !policiesApi.data) return <Spinner />;
  const data = policiesApi.data;
  if (!data) return null;

  async function grantOverride(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const hours = Number(form.expiresHours);
      const expiresAt =
        hours > 0 ? new Date(Date.now() + hours * 3_600_000).toISOString() : null;
      await api("/api/admin/rbac/overrides", {
        body: {
          staffId: form.staffId || data?.staffList[0]?.id,
          permission: form.permission,
          effect: form.effect,
          reason: form.reason,
          expiresAt,
        },
      });
      await policiesApi.reload();
      setOpen(false);
      setForm({ staffId: "", permission: PERMISSIONS[0], effect: "allow", reason: "", expiresHours: "24" });
      onOk("Staff permission override applied.");
    } catch (err) {
      onErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/admin/rbac/overrides/${id}`, { method: "DELETE" });
      await policiesApi.reload();
      onOk("Permission override revoked.");
    } catch (err) {
      onErr(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading text-foreground">Just-In-Time (JIT) & Staff Overrides</h2>
          <p className="text-sm text-muted-foreground">
            Grant temporary elevated permissions or explicitly deny specific actions for individual staff members.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Grant Override
          </Button>
        )}
      </div>

      <DataTable
        rows={data.overrides}
        empty="No active staff permission overrides."
        columns={[
          {
            header: "Staff Member",
            cell: (r) => (
              <div>
                <div className="font-medium text-foreground">{r.staffName ?? "Unknown"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.staffEmail} {r.staffRole ? `(${ROLE_LABELS[r.staffRole]})` : ""}
                </div>
              </div>
            ),
          },
          { header: "Permission", cell: (r) => <span className="font-mono text-xs">{r.permission}</span> },
          {
            header: "Effect",
            cell: (r) => (
              <Badge tone={r.effect === "allow" ? "green" : "red"}>
                {r.effect.toUpperCase()}
              </Badge>
            ),
          },
          { header: "Justification", cell: (r) => r.reason ?? "—" },
          { header: "Expires", cell: (r) => (r.expiresAt ? fmtDate(r.expiresAt) : "Permanent") },
          {
            header: "Actions",
            cell: (r) =>
              canManage ? (
                <Button size="sm" variant="secondary" onClick={() => void revoke(r.id)}>
                  <Trash2 className="size-3.5" /> Revoke
                </Button>
              ) : null,
          },
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="Grant Staff Permission Override">
        <form onSubmit={grantOverride} className="space-y-4">
          <Field label="Staff Member">
            <Select
              required
              value={form.staffId || data.staffList[0]?.id || ""}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            >
              {data.staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({ROLE_LABELS[s.role]})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Permission">
            <Select
              value={form.permission}
              onChange={(e) => setForm({ ...form, permission: e.target.value })}
            >
              {PERMISSIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Effect">
              <Select
                value={form.effect}
                onChange={(e) => setForm({ ...form, effect: e.target.value as "allow" | "deny" })}
              >
                <option value="allow">Allow (Elevate)</option>
                <option value="deny">Deny (Restrict)</option>
              </Select>
            </Field>
            <Field label="JIT Duration (Hours)" hint="0 = permanent">
              <Input
                type="number"
                min={0}
                max={8760}
                value={form.expiresHours}
                onChange={(e) => setForm({ ...form, expiresHours: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Audit Justification">
            <Textarea
              required
              minLength={3}
              placeholder="Ticket # or operational reason for access override..."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            <KeyRound className="size-4" /> Apply Override
          </Button>
        </form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: DSAR & Erasure Queue
// ---------------------------------------------------------------------------

function DsarTab({
  dsarApi,
  canManage,
  onOk,
  onErr,
}: {
  dsarApi: ReturnType<typeof useApi<{ items: DsarRow[]; total: number }>>;
  canManage: boolean;
  onOk: (msg: string) => void;
  onErr: (err: unknown) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<DsarRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subjectEmail: "", type: "access", reason: "" });

  if (dsarApi.loading && !dsarApi.data) return <Spinner />;
  if (dsarApi.error) return <ErrorNote message={dsarApi.error} />;
  const items = dsarApi.data?.items ?? [];

  async function createDsar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/privacy/requests", { body: form });
      await dsarApi.reload();
      setCreateOpen(false);
      setForm({ subjectEmail: "", type: "access", reason: "" });
      onOk("DSAR request logged with statutory SLA.");
    } catch (err) {
      onErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api(`/api/admin/privacy/requests/${id}`, { method: "PATCH", body: { status } });
      await dsarApi.reload();
      setSelected(null);
      onOk(`DSAR marked as ${status}.`);
    } catch (err) {
      onErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function executeDsar(dsar: DsarRow) {
    setBusy(true);
    try {
      const res = await api<{ exportPackage?: unknown; erasureResult?: { anonymizedEmail: string } }>(
        `/api/admin/privacy/requests/${dsar.id}/execute`,
        { method: "POST", body: {} },
      );
      if (res.exportPackage) {
        const blob = new Blob([JSON.stringify(res.exportPackage, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${dsar.reference}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
        onOk(`Data export generated and downloaded for ${dsar.reference}.`);
      } else if (res.erasureResult) {
        onOk(`Customer PII anonymized (${res.erasureResult.anonymizedEmail}).`);
      } else {
        onOk(`DSAR ${dsar.reference} completed.`);
      }
      await dsarApi.reload();
      setSelected(null);
    } catch (err) {
      onErr(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading text-foreground">Data Subject Requests (DSAR)</h2>
          <p className="text-sm text-muted-foreground">
            Manage GDPR / NDPR access, portability, and right-to-be-forgotten erasure workflows.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Log DSAR
          </Button>
        )}
      </div>

      <DataTable
        rows={items}
        onRowClick={(r) => setSelected(r)}
        empty="No Data Subject Requests in queue."
        columns={[
          { header: "Reference", cell: (r) => <span className="font-mono text-xs font-medium">{r.reference}</span> },
          { header: "Subject", cell: (r) => r.subjectEmail },
          { header: "Type", cell: (r) => <Badge tone={r.type === "erasure" ? "red" : "blue"}>{r.type}</Badge> },
          { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
          { header: "SLA Due", cell: (r) => fmtDay(r.dueAt) },
          { header: "Submitted", cell: (r) => fmtDate(r.createdAt) },
        ]}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Log Data Subject Request">
        <form onSubmit={createDsar} className="space-y-4">
          <Field label="Customer Email">
            <Input
              type="email"
              required
              placeholder="customer@example.com"
              value={form.subjectEmail}
              onChange={(e) => setForm({ ...form, subjectEmail: e.target.value })}
            />
          </Field>
          <Field label="Request Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="access">Right of Access (JSON Export)</option>
              <option value="portability">Data Portability (JSON Export)</option>
              <option value="erasure">Right to Erasure (Anonymize PII)</option>
              <option value="rectification">Rectification</option>
              <option value="restriction">Processing Restriction</option>
            </Select>
          </Field>
          <Field label="Reason / Verification Notes">
            <Textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Identity verified via..."
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Create Request
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.reference ?? ""}>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-sm bg-muted/40 p-3">
              <div>
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="font-medium">{selected.subjectEmail}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Type & Status</div>
                <div className="mt-0.5 flex gap-1.5">
                  <Badge tone={selected.type === "erasure" ? "red" : "blue"}>{selected.type}</Badge>
                  <StatusBadge value={selected.status} />
                </div>
              </div>
            </div>
            {selected.reason && (
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Reason</div>
                <p className="mt-1 text-foreground">{selected.reason}</p>
              </div>
            )}
            {selected.resolutionNotes && (
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Resolution Notes</div>
                <p className="mt-1 text-foreground">{selected.resolutionNotes}</p>
              </div>
            )}
            {canManage && selected.status !== "completed" && selected.status !== "rejected" && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {selected.status === "pending" && (
                  <Button variant="secondary" disabled={busy} onClick={() => void updateStatus(selected.id, "in_review")}>
                    Mark In Review
                  </Button>
                )}
                {selected.type === "access" || selected.type === "portability" ? (
                  <Button disabled={busy} onClick={() => void executeDsar(selected)}>
                    <Download className="size-4" /> Export & Complete
                  </Button>
                ) : selected.type === "erasure" ? (
                  <Button variant="danger" disabled={busy} onClick={() => void executeDsar(selected)}>
                    <ShieldAlert className="size-4" /> Execute PII Anonymization
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => void executeDsar(selected)}>
                    <CheckCircle2 className="size-4" /> Mark Completed
                  </Button>
                )}
                <Button variant="secondary" disabled={busy} onClick={() => void updateStatus(selected.id, "rejected")}>
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5: Consents & Retention
// ---------------------------------------------------------------------------

function ConsentsAndRetentionTab({
  consentsApi,
  settings,
  canManage,
  onOk,
  onErr,
}: {
  consentsApi: ReturnType<typeof useApi<{ items: ConsentRow[]; total: number }>>;
  settings: PrivacySettings | null;
  canManage: boolean;
  onOk: (msg: string) => void;
  onErr: (err: unknown) => void;
}) {
  const [auditDays, setAuditDays] = useState(settings?.auditLogRetentionDays ?? 365);
  const [inactiveDays, setInactiveDays] = useState(settings?.inactiveCustomerRetentionDays ?? 1095);
  const [slaDays, setSlaDays] = useState(settings?.dsarSlaDays ?? 30);
  const [policyVer, setPolicyVer] = useState(settings?.policyVersion ?? "2026.1");
  const [maskDefault, setMaskDefault] = useState(settings?.maskPiiByDefault ?? true);
  const [saving, setSaving] = useState(false);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admin/privacy/settings", {
        method: "PATCH",
        body: {
          auditLogRetentionDays: auditDays,
          inactiveCustomerRetentionDays: inactiveDays,
          dsarSlaDays: slaDays,
          policyVersion: policyVer,
          maskPiiByDefault: maskDefault,
        },
      });
      onOk("Global privacy retention & policy settings saved.");
    } catch (err) {
      onErr(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCheck className="size-5 text-brand-700" />
            Data Retention & Compliance Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Audit Log Retention (Days)">
              <Input
                type="number"
                min={30}
                max={3650}
                disabled={!canManage}
                value={auditDays}
                onChange={(e) => setAuditDays(Number(e.target.value) || 365)}
              />
            </Field>
            <Field label="Inactive Customer Retention">
              <Input
                type="number"
                min={90}
                max={3650}
                disabled={!canManage}
                value={inactiveDays}
                onChange={(e) => setInactiveDays(Number(e.target.value) || 1095)}
              />
            </Field>
            <Field label="DSAR SLA (Days)">
              <Input
                type="number"
                min={5}
                max={90}
                disabled={!canManage}
                value={slaDays}
                onChange={(e) => setSlaDays(Number(e.target.value) || 30)}
              />
            </Field>
            <Field label="Policy Version">
              <Input
                disabled={!canManage}
                value={policyVer}
                onChange={(e) => setPolicyVer(e.target.value)}
              />
            </Field>
            <Field label="Default PII Masking">
              <Select
                disabled={!canManage}
                value={maskDefault ? "1" : "0"}
                onChange={(e) => setMaskDefault(e.target.value === "1")}
              >
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
              </Select>
            </Field>
            {canManage && (
              <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
                <Button type="submit" loading={saving}>
                  Save Retention Settings
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-3 text-lg font-heading text-foreground">Customer Consent Ledger</h3>
        {consentsApi.loading && !consentsApi.data ? (
          <Spinner />
        ) : (
          <DataTable
            rows={consentsApi.data?.items ?? []}
            empty="No customer consent records logged yet."
            columns={[
              {
                header: "Customer",
                cell: (r) => (
                  <div>
                    <div className="font-medium text-foreground">{r.customerName}</div>
                    <div className="text-xs text-muted-foreground">{r.customerEmail}</div>
                  </div>
                ),
              },
              { header: "Purpose", cell: (r) => <Badge tone="blue">{r.purpose.replaceAll("_", " ")}</Badge> },
              {
                header: "Consent",
                cell: (r) => <Badge tone={r.granted ? "green" : "red"}>{r.granted ? "Granted" : "Revoked"}</Badge>,
              },
              { header: "Policy", cell: (r) => <span className="font-mono text-xs">{r.policyVersion}</span> },
              { header: "Source", cell: (r) => r.source },
              { header: "Updated", cell: (r) => fmtDate(r.updatedAt) },
            ]}
          />
        )}
      </div>
    </div>
  );
}
