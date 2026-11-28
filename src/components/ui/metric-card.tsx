"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: LucideIcon;
  trend?: { label: string; tone?: "up" | "down" | "neutral" };
  accent?: "brand" | "emerald" | "amber" | "accent" | "dark";
  className?: string;
}

const accentStyles = {
  brand: "border-t-brand-700",
  emerald: "border-t-emerald-600",
  amber: "border-t-amber-500",
  accent: "border-t-accent-600",
  dark: "bg-brand-900 text-white border-brand-800 border-t-brand-400",
};

const iconBg = {
  brand: "bg-brand-50 text-brand-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  accent: "bg-accent-50 text-accent-700",
  dark: "bg-brand-800 text-brand-200",
};

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  accent = "brand",
  className,
}: MetricCardProps) {
  const isDark = accent === "dark";
  return (
    <div
      className={cn(
        "relative rounded-sm border border-t-2 bg-white p-5 shadow-xs transition-all hover:shadow-sm",
        isDark ? accentStyles.dark : cn("border-border", accentStyles[accent]),
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            isDark ? "text-brand-300" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {Icon && (
          <span className={cn("flex size-8 items-center justify-center rounded-sm", iconBg[accent])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>

      <div
        className={cn(
          "mt-2 font-heading text-3xl tracking-tight tabular-nums",
          isDark ? "text-white" : "text-foreground",
        )}
      >
        {value}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {sub && (
          <span className={cn("text-xs", isDark ? "text-brand-300" : "text-muted-foreground")}>
            {sub}
          </span>
        )}
        {trend && (
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
              trend.tone === "up" && "bg-emerald-50 text-emerald-700",
              trend.tone === "down" && "bg-accent-50 text-accent-700",
              (!trend.tone || trend.tone === "neutral") && "bg-muted text-muted-foreground",
            )}
          >
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}
