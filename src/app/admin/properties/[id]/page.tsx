"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorNote,
  PageHeader,
  Spinner,
  StatusBadge,
  TrustCheckItem,
  VerificationBadge,
} from "@/components/ui";
import PropertyForm, { type PropertyDto } from "@/components/properties/PropertyForm";
import MediaManager from "@/components/properties/MediaManager";
import { api, useApi } from "@/lib/client";

type Readiness = {
  ready: boolean;
  hasAssignedAgent: boolean;
  hasApprovedTitleDoc: boolean;
  hasCryptographicSeal: boolean;
  isVerified: boolean;
  missing: string[];
};

export default function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, loading, error, reload } = useApi<PropertyDto>(`/api/admin/properties/${id}`);
  const readiness = useApi<Readiness>(`/api/admin/properties/${id}/verify`);
  const me = useApi<{ permissions: string[] }>("/api/admin/auth/me");
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Property not found"} />;

  const canWrite = me.data?.permissions.includes("properties.write") ?? false;
  const canDelete = me.data?.permissions.includes("properties.delete") ?? false;

  const setStatus = async (status: string) => {
    setErr(null);
    try {
      await api(`/api/admin/properties/${id}/status`, { body: { status } });
      await Promise.all([reload(), readiness.reload()]);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm("Remove this property from the system? Past transactions keep their record.")) return;
    try {
      await api(`/api/admin/properties/${id}`, { method: "DELETE" });
      router.replace("/admin/properties");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const r = readiness.data;

  return (
    <>
      <PageHeader
        title={data.name}
        subtitle="Edit listing & verify trust readiness"
        actions={
          <>
            <VerificationBadge state={r?.isVerified ? "verified" : "unverified"} />
            <StatusBadge value={data.status} />
            {canWrite && data.status !== "sold" && (
              <Button variant="secondary" onClick={() => setStatus("sold")}>
                Mark sold
              </Button>
            )}
            {canWrite && data.status !== "reserved" && data.status !== "sold" && (
              <Button variant="secondary" onClick={() => setStatus("reserved")}>
                Mark reserved
              </Button>
            )}
            {canWrite && data.status !== "available" && (
              <Button variant="secondary" onClick={() => setStatus("available")}>
                Mark available
              </Button>
            )}
            <Link href={`/admin/documents?propertyId=${id}`}>
              <Button variant="secondary">Documents</Button>
            </Link>
            {canDelete && (
              <Button variant="danger" onClick={remove}>
                Remove
              </Button>
            )}
          </>
        }
      />

      <ErrorNote message={err} />

      {r && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-brand-700" />
              Property Trust &amp; Publication Scorecard
            </CardTitle>
            <Link href="/admin/verification">
              <Button size="sm" variant="secondary">
                Open Verification Queue →
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TrustCheckItem
              ok={r.hasAssignedAgent}
              label="Assigned Agent"
              detail={r.hasAssignedAgent ? "Verification/sales agent active" : "Assign in Verification Queue"}
            />
            <TrustCheckItem
              ok={r.hasApprovedTitleDoc}
              label="Approved Title Doc"
              detail={r.hasApprovedTitleDoc ? "C of O / Deed / Survey vetted" : "Upload & vet in Document Vault"}
            />
            <TrustCheckItem
              ok={r.hasCryptographicSeal}
              label="Cryptographic Seal"
              detail={r.hasCryptographicSeal ? "HMAC-SHA256 seal active" : "Pending approval seal"}
            />
            <TrustCheckItem
              ok={r.isVerified}
              label="Admin Verification"
              detail={r.isVerified ? "Ready for public marketplace" : "Complete final review in Queue"}
            />
          </CardContent>
        </Card>
      )}

      <div className="mt-6 space-y-6">
        <MediaManager propertyId={id} canWrite={canWrite} />
        <PropertyForm key={data.status} initial={{ ...data, id }} canWrite={canWrite} />
      </div>
    </>
  );
}
