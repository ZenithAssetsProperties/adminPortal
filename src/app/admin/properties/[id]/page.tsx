"use client";
import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import PropertyForm, { type PropertyDto } from "@/components/properties/PropertyForm";
import MediaManager from "@/components/properties/MediaManager";
import { api, useApi } from "@/lib/client";

export default function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error, reload } = useApi<PropertyDto>(`/api/admin/properties/${id}`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const [err, setErr] = useState<string | null>(null);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Property not found"} />;
  const canWrite = me.data?.permissions.includes("properties.write") ?? false;
  const canDelete = me.data?.permissions.includes("properties.delete") ?? false;

  const setStatus = async (status: string) => { setErr(null); try { await api(`/api/admin/properties/${id}/status`, { body: { status } }); await reload(); } catch (e) { setErr((e as Error).message); } };
  const remove = async () => {
    if (!confirm("Remove this property from the system? Past transactions keep their record.")) return;
    try { await api(`/api/admin/properties/${id}`, { method: "DELETE" }); router.replace("/admin/properties"); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <PageHeader title={data.name} subtitle="Edit listing"
        actions={<><StatusBadge value={data.status} />
          {canWrite && data.status !== "sold" && <Button variant="secondary" onClick={() => setStatus("sold")}>Mark sold</Button>}
          {canWrite && data.status !== "reserved" && data.status !== "sold" && <Button variant="secondary" onClick={() => setStatus("reserved")}>Mark reserved</Button>}
          {canWrite && data.status !== "available" && <Button variant="secondary" onClick={() => setStatus("available")}>Mark available</Button>}
          <Link href={`/admin/documents?propertyId=${id}`}><Button variant="secondary">Documents</Button></Link>
          {canDelete && <Button variant="danger" onClick={remove}>Remove</Button>}</>} />
      <ErrorNote message={err} />
      <div className="mt-4 space-y-6">
        <MediaManager propertyId={id} canWrite={canWrite} />
        <PropertyForm key={data.status} initial={{ ...data, id }} canWrite={canWrite} />
      </div>
    </>
  );
}
