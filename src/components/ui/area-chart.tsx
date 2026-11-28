"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ChartPoint = {
  label: string;
  value: number;
  formatted: string;
};

export function AreaChart({
  data,
  height = 160,
  className,
}: {
  data: ChartPoint[];
  height?: number;
  className?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex h-36 items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
        No revenue data recorded in this window yet.
      </div>
    );
  }

  const w = 520;
  const h = height;
  const padX = 16;
  const padY = 18;
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  const coords = data.map((d, i) => {
    const x = data.length === 1 ? w / 2 : padX + (i / (data.length - 1)) * (w - padX * 2);
    const y = h - padY - (d.value / maxVal) * (h - padY * 2);
    return { x, y, ...d };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${h - padY} L ${coords[0].x} ${h - padY} Z`;

  return (
    <div className={cn("relative w-full select-none", className)}>
      {hoverIdx !== null && coords[hoverIdx] && (
        <div className="mb-2 flex items-center justify-between rounded-sm bg-brand-900 px-3 py-1.5 text-xs text-white shadow-xs">
          <span className="font-medium text-brand-200">{coords[hoverIdx].label}</span>
          <span className="font-semibold tabular-nums">{coords[hoverIdx].formatted}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" role="img" aria-label="Revenue trend chart">
        <defs>
          <linearGradient id="zenithAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14505b" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#14505b" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal subtle grid lines */}
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const gy = h - padY - t * (h - padY * 2);
          return <line key={t} x1={padX} y1={gy} x2={w - padX} y2={gy} stroke="#e2e8e7" strokeDasharray="3 3" />;
        })}

        <path d={areaPath} fill="url(#zenithAreaGrad)" />
        <path d={linePath} fill="none" stroke="#14505b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => (
          <g
            key={c.label}
            className="cursor-pointer"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <circle cx={c.x} cy={c.y} r={14} fill="transparent" />
            <circle
              cx={c.x}
              cy={c.y}
              r={hoverIdx === i ? 5.5 : 3.5}
              fill={hoverIdx === i ? "#081f24" : "#ffffff"}
              stroke="#14505b"
              strokeWidth="2.2"
            />
          </g>
        ))}
      </svg>

      <div className="mt-1 flex justify-between px-2 text-[11px] font-medium text-muted-foreground">
        {data.map((d, i) => (
          <span
            key={d.label}
            className={cn("transition-colors", hoverIdx === i && "font-semibold text-brand-900")}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
