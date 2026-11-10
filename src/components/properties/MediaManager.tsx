"use client";
import { useRef, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button, Card, ErrorNote, Field, Input, Select, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Item = { id: string; kind: string; url: string | null; previewUrl: string | null; caption: string | null; isCover: boolean; storageKey: string | null };

export default function MediaManager({ propertyId, canWrite }: { propertyId: string; canWrite: boolean }) {
  const { data, loading, reload } = useApi<{ items: Item[] }>(`/api/admin/properties/${propertyId}/media`);
  const [kind, setKind] = useState("photo");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const external = ["video", "drone", "tour360"].includes(kind);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (external) await api(`/api/admin/properties/${propertyId}/media`, { body: { kind, url: link } });
      else {
        const f = fileRef.current?.files?.[0]; if (!f) throw new Error("Choose a file first");
        const fd = new FormData(); fd.set("file", f); fd.set("kind", kind);
        await api(`/api/admin/properties/${propertyId}/media`, { body: fd });
        if (fileRef.current) fileRef.current.value = "";
      }
      setLink(""); await reload();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const act = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); await reload(); } catch (err) { setError((err as Error).message); } };

  return (
    <Card title="Photos, videos & tours">
      {canWrite && (
        <form onSubmit={add} className="mb-6 grid items-end gap-3 sm:grid-cols-[160px_1fr_auto]">
          <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="photo">Photo</option><option value="floorplan">Floor plan</option><option value="siteplan">Site plan</option>
            <option value="video">Video link</option><option value="drone">Drone footage link</option><option value="tour360">360° tour link</option>
          </Select></Field>
          {external
            ? <Field label="https link" hint="YouTube, Vimeo, Matterport…"><Input type="url" required placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} /></Field>
            : <Field label="File" hint="JPG, PNG or WebP, up to 15 MB"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="w-full text-sm" /></Field>}
          <Button type="submit" loading={busy}>Add</Button>
        </form>
      )}
      <ErrorNote message={error} />
      {loading ? <Spinner /> : !data?.items.length ? <p className="py-6 text-center text-sm text-brand-400">No media yet.</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((m) => (
            <li key={m.id} className="border border-line">
              <div className="aspect-video bg-brand-50">
                {m.storageKey && m.previewUrl && !m.previewUrl.includes(".pdf")
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.previewUrl} alt={m.caption ?? m.kind} className="size-full object-cover" />
                  : <div className="flex size-full items-center justify-center p-2 text-center text-xs text-brand-500 break-all">{m.url ?? "Document"}</div>}
              </div>
              <div className="flex items-center justify-between gap-2 p-2 text-xs">
                <span className="capitalize text-brand-600">{m.kind}{m.isCover && " · cover"}</span>
                {canWrite && <span className="flex gap-1">
                  {m.kind === "photo" && m.storageKey && !m.isCover && <button title="Make cover" aria-label="Make cover" onClick={() => act(() => api(`/api/admin/properties/${propertyId}/media`, { method: "PATCH", body: { mediaId: m.id } }))} className="p-1 hover:text-brand-900"><Star className="size-4" /></button>}
                  <button title="Remove" aria-label="Remove" onClick={() => confirm("Remove this item?") && act(() => api(`/api/admin/properties/${propertyId}/media?mediaId=${m.id}`, { method: "DELETE" }))} className="p-1 text-accent-700"><Trash2 className="size-4" /></button>
                </span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
