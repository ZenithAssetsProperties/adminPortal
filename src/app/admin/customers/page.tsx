"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Badge, Card, DataTable, ErrorNote, Input, PageHeader, Select, Spinner } from "@/components/ui";
import Pager from "@/components/customers/Pager";
import { fmtDay, useApi } from "@/lib/client";

type Row = { id: string; fullName: string; email: string; phone: string | null; blocked: boolean; isDiaspora: boolean; emailVerified: boolean; createdAt: string };

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState(""); const [blocked, setBlocked] = useState(""); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(q && { q }), ...(blocked && { blocked }) }).toString();
  const { data, loading, error } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/customers?${qs}`);
  return (
    <>
      <PageHeader title="Customers" subtitle={data ? `${data.total} registered` : undefined} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-brand-300" /><Input className="pl-9" placeholder="Search name, email or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select value={blocked} onChange={(e) => { setBlocked(e.target.value); setPage(1); }}><option value="">All customers</option><option value="0">Active</option><option value="1">Blocked</option></Select>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : (
          <DataTable rows={data?.items ?? []} onRowClick={(r) => router.push(`/admin/customers/${r.id}`)} empty="No customers match."
            columns={[
              { header: "Customer", cell: (r) => <div><div className="font-medium text-brand-900">{r.fullName}</div><div className="text-xs text-brand-400">{r.email}</div></div> },
              { header: "Phone", cell: (r) => r.phone ?? "—" },
              { header: "Tags", cell: (r) => <div className="flex gap-1">{r.isDiaspora && <Badge tone="blue">Diaspora</Badge>}{r.blocked && <Badge tone="red">Blocked</Badge>}</div> },
              { header: "Joined", cell: (r) => fmtDay(r.createdAt) },
            ]} />
        )}
        {data && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      </Card>
    </>
  );
}
