import { cn } from "@/lib/utils";

export function ProgressRing({
  percent,
  size = 84,
  stroke = 7,
  label,
  className,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (clamped / 100) * circ;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-brand-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(
            "transition-all duration-500",
            clamped >= 80 ? "text-emerald-600" : clamped >= 50 ? "text-brand-600" : "text-amber-500",
          )}
        />
      </svg>
      <div className="absolute flex flex-col items-center text-center">
        <span className="font-heading text-xl leading-none text-foreground tabular-nums">{clamped}%</span>
        {label && <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}
