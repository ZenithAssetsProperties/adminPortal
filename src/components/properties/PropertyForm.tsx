"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Nearby = { category: string; name: string; distance?: string };
export type PropertyDto = {
  id?: string; name: string; type: string; purpose: string; status: string; state: string; city: string; area: string | null;
  latitude: string | null; longitude: string | null; priceKobo: number; sizeSqm: number | null; landSizeSqm: number | null;
  bedrooms: number | null; bathrooms: number | null; parking: number | null; developmentStatus: string | null;
  description: string | null; features: string[]; nearby: Nearby[]; investment: Record<string, string> | null;
  verified: boolean; verificationNotes: string | null; paymentPlanAvailable: boolean; minDepositPercent: number;
  maxPlanMonths: number; reservationFeeKobo: number; reservationDays: number; featured: boolean; priceReduced: boolean;
  limitedAvailability: boolean; agentId: string | null;
};

export const EMPTY: PropertyDto = {
  name: "", type: "house", purpose: "buy", status: "draft", state: "Lagos", city: "", area: "", latitude: "", longitude: "",
  priceKobo: 0, sizeSqm: null, landSizeSqm: null, bedrooms: null, bathrooms: null, parking: null, developmentStatus: "",
  description: "", features: [], nearby: [], investment: null, verified: false, verificationNotes: "", paymentPlanAvailable: false,
  minDepositPercent: 30, maxPlanMonths: 12, reservationFeeKobo: 0, reservationDays: 7, featured: false, priceReduced: false,
  limitedAvailability: false, agentId: null,
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand-700" /> {label}</label>
);

export default function PropertyForm({ initial, canWrite = true }: { initial: PropertyDto; canWrite?: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<PropertyDto>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const agents = useApi<{ items: { id: string; name: string }[] }>("/api/admin/agents?pageSize=100&active=1");
  const set = <K extends keyof PropertyDto>(k: K, v: PropertyDto[K]) => { setP((x) => ({ ...x, [k]: v })); setSaved(false); };

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const { id, ...body } = p;
    const payload = {
      ...body,
      area: body.area || null, latitude: body.latitude || null, longitude: body.longitude || null,
      developmentStatus: body.developmentStatus || null, description: body.description || null,
      verificationNotes: body.verificationNotes || null, agentId: body.agentId || null,
      investment: body.purpose === "invest" ? body.investment : null,
    };
    try {
      if (id) { await api(`/api/admin/properties/${id}`, { method: "PATCH", body: payload }); setSaved(true); }
      else { const r = await api<{ id: string }>("/api/admin/properties", { body: payload }); router.replace(`/admin/properties/${r.id}`); }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const inv = p.investment ?? {};
  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={!canWrite} className="space-y-6">
        <Card title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Property name"><Input required minLength={3} value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="4-Bedroom Detached Duplex" /></Field></div>
            <Field label="Type"><Select value={p.type} onChange={(e) => set("type", e.target.value)}>{["land", "house", "apartment", "commercial"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Purpose"><Select value={p.purpose} onChange={(e) => set("purpose", e.target.value)}>{["buy", "invest", "rent"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Status" hint="Draft listings are hidden from the website"><Select value={p.status} onChange={(e) => set("status", e.target.value)}>{["draft", "available", "reserved", "sold"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Assigned agent"><Select value={p.agentId ?? ""} onChange={(e) => set("agentId", e.target.value || null)}><option value="">Unassigned</option>{agents.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          </div>
        </Card>

        <Card title="Location">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="State"><Input required value={p.state} onChange={(e) => set("state", e.target.value)} /></Field>
            <Field label="City"><Input required value={p.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Area"><Input value={p.area ?? ""} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Lekki Phase 1" /></Field>
            <Field label="Latitude" hint="Staff only. Never shown publicly."><Input value={p.latitude ?? ""} onChange={(e) => set("latitude", e.target.value)} /></Field>
            <Field label="Longitude" hint="Staff only."><Input value={p.longitude ?? ""} onChange={(e) => set("longitude", e.target.value)} /></Field>
          </div>
        </Card>

        <Card title="Pricing & payment">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Price (₦)"><Input required type="number" min={1} step="any" value={p.priceKobo ? p.priceKobo / 100 : ""} onChange={(e) => set("priceKobo", Math.round(Number(e.target.value) * 100))} /></Field>
            <Field label="Reservation fee (₦)" hint="0 = no reservation fee"><Input type="number" min={0} step="any" value={p.reservationFeeKobo / 100} onChange={(e) => set("reservationFeeKobo", Math.round(Number(e.target.value) * 100))} /></Field>
            <Field label="Reservation holds for (days)"><Input type="number" min={1} max={90} value={p.reservationDays} onChange={(e) => set("reservationDays", Number(e.target.value))} /></Field>
            <div className="sm:col-span-3"><Check label="Payment plan available" checked={p.paymentPlanAvailable} onChange={(b) => set("paymentPlanAvailable", b)} /></div>
            {p.paymentPlanAvailable && <>
              <Field label="Minimum deposit (%)"><Input type="number" min={0} max={100} value={p.minDepositPercent} onChange={(e) => set("minDepositPercent", Number(e.target.value))} /></Field>
              <Field label="Longest plan (months)"><Input type="number" min={1} max={120} value={p.maxPlanMonths} onChange={(e) => set("maxPlanMonths", Number(e.target.value))} /></Field>
            </>}
          </div>
        </Card>

        <Card title="Details">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Property size (sqm)"><Input type="number" min={1} value={p.sizeSqm ?? ""} onChange={(e) => set("sizeSqm", num(e.target.value))} /></Field>
            <Field label="Land size (sqm)"><Input type="number" min={1} value={p.landSizeSqm ?? ""} onChange={(e) => set("landSizeSqm", num(e.target.value))} /></Field>
            <Field label="Development status"><Input value={p.developmentStatus ?? ""} onChange={(e) => set("developmentStatus", e.target.value)} placeholder="Completed / Off-plan" /></Field>
            <Field label="Bedrooms"><Input type="number" min={0} value={p.bedrooms ?? ""} onChange={(e) => set("bedrooms", num(e.target.value))} /></Field>
            <Field label="Bathrooms"><Input type="number" min={0} value={p.bathrooms ?? ""} onChange={(e) => set("bathrooms", num(e.target.value))} /></Field>
            <Field label="Parking spaces"><Input type="number" min={0} value={p.parking ?? ""} onChange={(e) => set("parking", num(e.target.value))} /></Field>
            <div className="sm:col-span-3"><Field label="Description"><Textarea rows={5} value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
            <div className="sm:col-span-3"><Field label="Features & amenities" hint="One per line"><Textarea rows={4} value={p.features.join("\n")} onChange={(e) => set("features", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></Field></div>
            <div className="sm:col-span-3"><Field label="Nearby places" hint="One per line as  Category | Name | Distance   e.g.  School | Greenspring | 5 min"><Textarea rows={4}
              value={p.nearby.map((n) => [n.category, n.name, n.distance].filter(Boolean).join(" | ")).join("\n")}
              onChange={(e) => set("nearby", e.target.value.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter((x) => x[0] && x[1]).map(([category, name, distance]) => ({ category, name, ...(distance ? { distance } : {}) })))} /></Field></div>
          </div>
        </Card>

        {p.purpose === "invest" && (
          <Card title="Investment information">
            <p className="mb-4 text-sm text-brand-500">Projections must be described as estimates, never guaranteed returns.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {([["rentalPotential", "Expected rental potential"], ["appreciation", "Appreciation information"], ["developmentPlans", "Development plans"], ["estimatedCosts", "Estimated costs"], ["risks", "Applicable risks"], ["horizon", "Investment horizon"]] as const).map(([k, label]) => (
                <Field key={k} label={label}><Textarea rows={2} value={inv[k] ?? ""} onChange={(e) => set("investment", { ...inv, [k]: e.target.value })} /></Field>
              ))}
            </div>
          </Card>
        )}

        <Card title="Verification & labels">
          <div className="space-y-4">
            <Check label="Zenith Verified" checked={p.verified} onChange={(b) => set("verified", b)} />
            <Field label="What was verified" hint="Shown to buyers so the badge is explained, not just displayed"><Textarea rows={3} value={p.verificationNotes ?? ""} onChange={(e) => set("verificationNotes", e.target.value)} /></Field>
            <div className="flex flex-wrap gap-6">
              <Check label="Featured" checked={p.featured} onChange={(b) => set("featured", b)} />
              <Check label="Price reduced" checked={p.priceReduced} onChange={(b) => set("priceReduced", b)} />
              <Check label="Limited availability" checked={p.limitedAvailability} onChange={(b) => set("limitedAvailability", b)} />
            </div>
          </div>
        </Card>
      </fieldset>
      <ErrorNote message={error} />
      {saved && <p role="status" className="text-sm text-emerald-700">Saved.</p>}
      {canWrite && <div className="flex gap-2"><Button type="submit" loading={busy}>{p.id ? "Save changes" : "Create property"}</Button><Button type="button" variant="secondary" onClick={() => router.push("/admin/properties")}>Cancel</Button></div>}
    </form>
  );
}
