"use client";
import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { isUuid } from "./shared";

type C = { id: string; fullName: string; email: string };

/** Search customers by name or email, or paste a customer ID directly. */
export default function CustomerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<C[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2 || isUuid(q.trim())) { setOptions([]); if (isUuid(q.trim())) onChange(q.trim()); return; }
    const t = setTimeout(() => {
      api<{ items: C[] }>(`/api/admin/customers?pageSize=8&q=${encodeURIComponent(q.trim())}`)
        .then((r) => { setOptions(r.items); setNote(r.items.length ? null : "No customer found"); })
        .catch(() => setNote("Search is unavailable. Paste the customer ID instead."));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-2">
      <Input placeholder="Search name or email, or paste ID" value={q} onChange={(e) => setQ(e.target.value)} />
      {options.length > 0 && (
        <Select size={Math.min(options.length + 1, 5)} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.fullName} — {o.email}</option>)}
        </Select>
      )}
      {note && <p className="text-xs text-brand-400">{note}</p>}
      {value && <p className="text-xs text-brand-600">Selected customer ID: <code>{value}</code> <button type="button" className="underline" onClick={() => { onChange(""); setQ(""); }}>clear</button></p>}
    </div>
  );
}
