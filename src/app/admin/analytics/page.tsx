"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, ErrorNote, PageHeader, Select, Spinner, Stat } from "@/components/ui";
import { BarChart, HBars } from "@/components/analytics/Bars";
import { useApi } from "@/lib/client";

type Report = {
  days: number; visitors: number; propertyViews: number; searches: number; enquiries: number; inspectionRequests: number; reservations: number; purchases: number;
  payment: { started: number; successful: number; conversionPercent: number | null }; abandonedTransactions: number;
  topProperties: { id: string; name: string; views: number }[]; topSearchTerms: { term: string; searches: number }[];
  channels: { source: string; leads: number; purchases: number }[]; daily: { day: string; visitors: number; views: number; enquiries: number }[];
};

export default function AnalyticsPage() {
  const [days, setDays] = useState("30");
  const { data, loading, error } = useApi<Report>(`/api/admin/analytics?days=${days}`);
  return (
    <>
      <PageHeader title="Analytics" subtitle="How buyers find and move through the platform"
        actions={<>
          <Select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Period"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>
          <a href={`/api/admin/analytics/export?days=${days}`}><Button variant="secondary"><Download className="size-4" /> CSV</Button></a>
        </>} />
      <ErrorNote message={error} />
      {loading && !data ? <Spinner /> : data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Visitors" value={data.visitors} /><Stat label="Property views" value={data.propertyViews} />
            <Stat label="Searches" value={data.searches} /><Stat label="Enquiries" value={data.enquiries} />
            <Stat label="Inspection requests" value={data.inspectionRequests} /><Stat label="Reservations" value={data.reservations} />
            <Stat label="Purchases" value={data.purchases} />
            <Stat label="Payment conversion" value={data.payment.conversionPercent === null ? "—" : `${data.payment.conversionPercent}%`} sub={`${data.payment.successful} paid of ${data.payment.started} started`} />
            <Stat label="Abandoned payments" value={data.abandonedTransactions} sub="Pending for over an hour" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Visitors per day"><BarChart label="Visitors per day" data={data.daily.map((d) => ({ label: d.day, value: d.visitors }))} /></Card>
            <Card title="Property views per day"><BarChart label="Property views per day" data={data.daily.map((d) => ({ label: d.day, value: d.views }))} /></Card>
            <Card title="Most viewed properties"><HBars rows={data.topProperties.map((p) => ({ label: p.name, value: p.views }))} /></Card>
            <Card title="Top searches"><HBars rows={data.topSearchTerms.map((t) => ({ label: t.term, value: t.searches }))} /></Card>
            <Card title="Marketing channels" className="lg:col-span-2"><HBars rows={data.channels.map((c) => ({ label: c.source, value: c.leads, extra: `${c.purchases} purchase${c.purchases === 1 ? "" : "s"}` }))} />
              <p className="mt-3 text-xs text-brand-400">Bars show leads by source; purchases are credited to the buyer&apos;s original source.</p></Card>
          </div>
        </div>
      )}
    </>
  );
}
