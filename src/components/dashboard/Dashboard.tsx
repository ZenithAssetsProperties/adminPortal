"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  FileCheck2,
  Lock,
  MessageSquare,
  Plus,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  AreaChart,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorNote,
  MetricCard,
  ProgressRing,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, naira, useApi } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

type Data = {
  properties?: Record<string, number>;
  verificationPipeline?: Record<string, number>;
  portfolioSummary?: { availableValueKobo: number; verifiedAvailable: number; totalAvailable: number };
  documentHealth?: { pending: number; sealed: number; fraudAlerts: number };
  newEnquiries?: number;
  pendingInspections?: number;
  activeReservations?: number;
  revenue?: { monthKobo: number; totalKobo: number };
  monthlyRevenueSeries?: { label: string; amountKobo: number }[];
  outstandingKobo?: number;
  leadsByStage?: Record<string, number>;
  activity: { source: "audit" | "notifications"; items: { id: string; title: string; detail: string; at: string }[] };
};

const QUICK_LINKS = [
  { href: "/admin/verification", label: "Verification Queue", desc: "Review & seal properties", perm: "properties.write", icon: ShieldCheck },
  { href: "/admin/properties/new", label: "Upload Property", desc: "Add new estate listing", perm: "properties.write", icon: Building2 },
  { href: "/admin/documents", label: "Document Vault", desc: "Approve & verify titles", perm: "documents.read", icon: FileCheck2 },
  { href: "/admin/enquiries", label: "Open Enquiries", desc: "Convert inbound leads", perm: "enquiries.read", icon: MessageSquare },
  { href: "/admin/inspections", label: "Inspections", desc: "Confirm site visits", perm: "inspections.read", icon: CalendarCheck },
  { href: "/admin/privacy", label: "Privacy & RBAC", desc: "Policies, DSAR & keys", perm: "privacy.read", icon: Lock },
];

export default function Dashboard() {
  const { data, loading, error } = useApi<Data>("/api/admin/dashboard");
  const me = useApi<{ staff: { name: string; role: Role }; permissions: string[] }>("/api/admin/auth/me");

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!data) return <ErrorNote message={error ?? "Could not load the dashboard"} />;

  const perms = me.data?.permissions ?? [];
  const p = data.properties;
  const vp = data.verificationPipeline;
  const port = data.portfolioSummary;
  const docHealth = data.documentHealth;
  const series = (data.monthlyRevenueSeries ?? []).map((s) => ({
    label: s.label,
    value: s.amountKobo,
    formatted: naira(s.amountKobo),
  }));

  const verifiedPct =
    port && port.totalAvailable > 0 ? Math.round((port.verifiedAvailable / port.totalAvailable) * 100) : 100;
  const pendingReviewCount = (vp?.pending_review ?? 0) + (vp?.unverified ?? 0);

  return (
    <div className="space-y-6">
      {/* Executive Hero Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
              Zenith Assets &amp; Properties
            </span>
            {me.data?.staff.role && <Badge tone="blue">{ROLE_LABELS[me.data.staff.role]}</Badge>}
          </div>
          <h1 className="mt-1 font-heading text-4xl tracking-tight text-foreground">
            {me.data ? `Welcome back, ${me.data.staff.name.split(" ")[0]}` : "Executive Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time portfolio telemetry, verified listing pipeline, and cryptographic document security.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.includes("properties.write") && (
            <>
              <Link href="/admin/verification">
                <Button variant="secondary">
                  <ShieldCheck className="size-4" /> Verification Queue
                </Button>
              </Link>
              <Link href="/admin/properties/new">
                <Button>
                  <Plus className="size-4" /> Upload Property
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Actionable Attention Banner */}
      {(docHealth?.fraudAlerts ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-800">
          <div className="flex items-center gap-2.5 font-medium">
            <ShieldAlert className="size-4 shrink-0 text-accent-600" />
            {docHealth!.fraudAlerts} document integrity alert(s) detected. Review immediately in the Verification Queue.
          </div>
          <Link href="/admin/verification" className="text-xs font-semibold underline">
            Investigate Now →
          </Link>
        </div>
      ) : pendingReviewCount > 0 && perms.includes("properties.write") ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <span>
              <strong>{pendingReviewCount}</strong> property listing(s) awaiting admin review, agent assignment, or title sealing before public release.
            </span>
          </div>
          <Link href="/admin/verification" className="text-xs font-semibold text-amber-950 underline">
            Open Queue →
          </Link>
        </div>
      ) : null}

      {/* PiggyVest-Inspired Portfolio & Financial Telemetry */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {port && (
          <MetricCard
            accent="dark"
            label="Available Portfolio Value"
            value={naira(port.availableValueKobo)}
            sub={`${port.verifiedAvailable} of ${port.totalAvailable} verified`}
            icon={Building2}
            trend={{ label: `${p?.available ?? 0} Live`, tone: "up" }}
          />
        )}
        {data.revenue && (
          <MetricCard
            accent="emerald"
            label="Revenue This Month"
            value={naira(data.revenue.monthKobo)}
            sub={`${naira(data.revenue.totalKobo)} collected all time`}
            icon={TrendingUp}
          />
        )}
        {data.outstandingKobo !== undefined && (
          <MetricCard
            accent="amber"
            label="Outstanding Receivables"
            value={naira(data.outstandingKobo)}
            sub="Active installment & balance plans"
            icon={Wallet}
          />
        )}
        {docHealth ? (
          <MetricCard
            accent={docHealth.fraudAlerts > 0 ? "accent" : "brand"}
            label="Cryptographic Trust"
            value={`${docHealth.sealed} Sealed`}
            sub={`${docHealth.pending} pending review · ${docHealth.fraudAlerts} alerts`}
            icon={docHealth.fraudAlerts > 0 ? ShieldAlert : Lock}
            trend={
              docHealth.fraudAlerts > 0
                ? { label: `${docHealth.fraudAlerts} Alert`, tone: "down" }
                : { label: "100% Intact", tone: "up" }
            }
          />
        ) : (
          data.newEnquiries !== undefined && (
            <MetricCard
              accent="brand"
              label="Open Enquiries"
              value={data.newEnquiries}
              sub={`${data.pendingInspections ?? 0} inspections to confirm`}
              icon={MessageSquare}
            />
          )
        )}
      </div>

      {/* Main Workspace Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Property.com-Inspired Verification Readiness + Funnel */}
          {vp && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg">Listing Verification Pipeline</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Zero unverified listings reach buyers. Every property requires an agent and sealed title documents.
                  </p>
                </div>
                <Link
                  href="/admin/verification"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  Open Queue <ArrowUpRight className="size-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex shrink-0 items-center gap-4 rounded-sm border border-border bg-muted/20 px-4 py-3">
                  <ProgressRing percent={verifiedPct} label="Verified" />
                  <div className="text-xs">
                    <div className="font-semibold text-foreground">Marketplace Trust</div>
                    <div className="mt-0.5 text-muted-foreground">
                      {port?.verifiedAvailable ?? 0} / {port?.totalAvailable ?? 0} live verified
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {[
                    { key: "unverified", label: "Drafts", tone: "border-border bg-muted/30" },
                    { key: "pending_review", label: "Review", tone: "border-amber-200 bg-amber-50/60" },
                    { key: "agent_assigned", label: "Agent", tone: "border-blue-200 bg-blue-50/60" },
                    { key: "verified", label: "Verified", tone: "border-emerald-200 bg-emerald-50/60" },
                    { key: "rejected", label: "Rejected", tone: "border-accent-100 bg-accent-50/60" },
                  ].map((stage) => (
                    <Link
                      key={stage.key}
                      href="/admin/verification"
                      className={`rounded-sm border p-3 transition-all hover:shadow-xs ${stage.tone}`}
                    >
                      <div className="font-heading text-2xl text-foreground tabular-nums">
                        {vp[stage.key] ?? 0}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{stage.label}</div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Smooth SVG Cashflow Trend */}
          {data.monthlyRevenueSeries && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Cashflow Trend (Last 6 Months)</CardTitle>
                  <p className="text-xs text-muted-foreground">Hover any node to inspect monthly settled volume.</p>
                </div>
                <Link href="/admin/payments" className="text-xs font-medium text-brand-700 hover:underline">
                  View Ledger →
                </Link>
              </CardHeader>
              <CardContent>
                <AreaChart data={series} />
              </CardContent>
            </Card>
          )}

          {/* Sales & Buyer Funnel */}
          {data.leadsByStage && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Sales &amp; Buyer Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Object.entries(data.leadsByStage).map(([stage, n]) => (
                    <div key={stage} className="rounded-sm border border-border bg-white p-3">
                      <div className="font-heading text-2xl text-foreground tabular-nums">{n}</div>
                      <div className="text-xs capitalize text-muted-foreground">{stage.replaceAll("_", " ")}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Rail: Command Shortcuts + Live Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Command Shortcuts</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {QUICK_LINKS.filter((l) => perms.includes(l.perm)).map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="group flex items-center justify-between rounded-sm border border-border bg-white px-3.5 py-2.5 transition-all hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-sm bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div>
                        <div className="text-sm font-medium text-foreground">{l.label}</div>
                        <div className="text-xs text-muted-foreground">{l.desc}</div>
                      </div>
                    </div>
                    <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-brand-700" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {data.activity.source === "audit" ? "Live Governance Feed" : "Your Notifications"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.activity.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.activity.items.slice(0, 8).map((a) => (
                    <li key={a.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{a.title}</span>
                        <span className="text-[11px] text-muted-foreground">{fmtDate(a.at)}</span>
                      </div>
                      {a.detail && <div className="mt-0.5 text-xs text-muted-foreground">{a.detail}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
