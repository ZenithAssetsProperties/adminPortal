"use client";
import Link from "next/link";
import { Card, ErrorNote, PageHeader, Spinner, Stat } from "@/components/ui";
import { fmtDate, naira, useApi } from "@/lib/client";

type Data = {
  properties?: Record<string, number>; newEnquiries?: number; pendingInspections?: number; activeReservations?: number;
  revenue?: { monthKobo: number; totalKobo: number }; outstandingKobo?: number; leadsByStage?: Record<string, number>;
  activity: { source: "audit" | "notifications"; items: { id: string; title: string; detail: string; at: string }[] };
};

const LINKS = [
  { href: "/admin/properties/new", label: "Add a property", perm: "properties.write" },
  { href: "/admin/documents", label: "Review documents", perm: "documents.approve" },
  { href: "/admin/enquiries", label: "Open enquiries", perm: "enquiries.read" },
  { href: "/admin/inspections", label: "Inspection requests", perm: "inspections.read" },
  { href: "/admin/transactions", label: "Transactions", perm: "transactions.read" },
  { href: "/admin/analytics", label: "Analytics", perm: "analytics.read" },
];

export default function Dashboard() {
  const { data, loading, error } = useApi<Data>("/api/admin/dashboard");
  const me = useApi<{ staff: { name: string }; permissions: string[] }>("/api/admin/auth/me");
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Could not load the dashboard"} />;
  const perms = me.data?.permissions ?? [];
  const p = data.properties;

  return (
    <>
      <PageHeader title={me.data ? `Welcome, ${me.data.staff.name.split(" ")[0]}` : "Dashboard"} subtitle="Here is where things stand today." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {p && <Stat label="Available listings" value={p.available} sub={`${p.reserved} reserved · ${p.sold} sold · ${p.draft} draft`} />}
        {data.newEnquiries !== undefined && <Stat label="New enquiries" value={data.newEnquiries} sub="Not yet handled" />}
        {data.pendingInspections !== undefined && <Stat label="Inspections to confirm" value={data.pendingInspections} />}
        {data.activeReservations !== undefined && <Stat label="Active reservations" value={data.activeReservations} />}
        {data.revenue && <Stat label="Revenue this month" value={naira(data.revenue.monthKobo)} sub={`${naira(data.revenue.totalKobo)} all time`} />}
        {data.outstandingKobo !== undefined && <Stat label="Outstanding balances" value={naira(data.outstandingKobo)} sub="Still to be paid by buyers" />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data.leadsByStage && (
            <Card title="Leads by stage">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Object.entries(data.leadsByStage).map(([stage, n]) => (
                  <div key={stage} className="border border-line p-3"><div className="font-heading text-2xl text-brand-900">{n}</div><div className="text-xs capitalize text-brand-500">{stage.replaceAll("_", " ")}</div></div>
                ))}
              </div>
            </Card>
          )}
          <Card title={data.activity.source === "audit" ? "Recent activity" : "Your notifications"}>
            {data.activity.items.length === 0 ? <p className="text-sm text-brand-400">Nothing yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {data.activity.items.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium text-brand-900">{a.title}</span>{a.detail && <span className="text-brand-500"> — {a.detail}</span>}</span><span className="text-xs text-brand-400">{fmtDate(a.at)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Quick links">
          <ul className="space-y-1 text-sm">
            {LINKS.filter((l) => perms.includes(l.perm)).map((l) => <li key={l.href}><Link href={l.href} className="block border border-line px-3 py-2 text-brand-800 hover:bg-brand-50">{l.label} →</Link></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
