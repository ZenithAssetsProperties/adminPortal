/** Dependable bar chart in plain SVG: no chart library, works with screen readers via the table fallback. */
export function BarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 600, H = 160, gap = 2, bw = Math.max(2, (W - gap * data.length) / Math.max(1, data.length));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" role="img" aria-label={label}>
        {data.map((d, i) => {
          const h = (d.value / max) * H;
          return <rect key={d.label} x={i * (bw + gap)} y={H - h} width={bw} height={Math.max(h, d.value ? 1 : 0)} className="fill-brand-500"><title>{`${d.label}: ${d.value}`}</title></rect>;
        })}
        <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" />
        <text x="0" y={H + 15} className="fill-brand-400 text-[10px]">{data[0]?.label}</text>
        <text x={W} y={H + 15} textAnchor="end" className="fill-brand-400 text-[10px]">{data.at(-1)?.label}</text>
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

export function HBars({ rows }: { rows: { label: string; value: number; extra?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-brand-400">No data for this period.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="text-brand-500">{r.value}{r.extra && ` · ${r.extra}`}</span></div>
          <div className="h-2 bg-brand-50"><div className="h-2 bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
