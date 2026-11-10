"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Search, BadgeCheck } from "lucide-react";
import { Button, Card, DataTable, Input, PageHeader, Select, Spinner, StatusBadge, ErrorNote } from "@/components/ui";
import { naira, useApi } from "@/lib/client";

type Row = { id: string; name: string; type: string; status: string; city: string; area: string | null; priceKobo: number; verified: boolean; featured: boolean };

export default function PropertiesPage() {
  const router = useRouter();
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [type, setType] = useState(""); const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(q && { q }), ...(status && { status }), ...(type && { type }) }).toString();
  const { data, loading, error } = useApi<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/properties?${qs}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Properties" subtitle={data ? `${data.total} listings` : undefined}
        actions={<Link href="/admin/properties/new"><Button><Plus className="size-4" /> Add property</Button></Link>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_160px]">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-brand-300" /><Input className="pl-9" placeholder="Search name, city or area" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["draft", "available", "reserved", "sold"].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All types</option>{["land", "house", "apartment", "commercial"].map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : (
          <DataTable rows={data?.items ?? []} onRowClick={(r) => router.push(`/admin/properties/${r.id}`)} empty="No properties match."
            columns={[
              { header: "Property", cell: (r) => <div><div className="font-medium text-brand-900">{r.name}{r.verified && <BadgeCheck className="ml-1 inline size-4 text-brand-500" aria-label="Verified" />}</div><div className="text-xs text-brand-400 capitalize">{r.type}</div></div> },
              { header: "Location", cell: (r) => [r.area, r.city].filter(Boolean).join(", ") },
              { header: "Price", cell: (r) => naira(r.priceKobo) },
              { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
            ]} />
        )}
        {pages > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      </Card>
    </>
  );
}
