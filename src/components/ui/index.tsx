"use client";

import { useEffect, useRef, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Re-export modular primitives aligned with the web architecture
export { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, type CardProps } from "@/components/ui/card";
export { Badge, StatusBadge, type BadgeProps } from "@/components/ui/badge";
export { Input } from "@/components/ui/input";
export { Label } from "@/components/ui/label";
export { Dialog, type DialogProps } from "@/components/ui/dialog";
export { Alert, type AlertProps } from "@/components/ui/alert";
export { EmptyState, type EmptyStateProps } from "@/components/ui/empty-state";
export { Separator, type SeparatorProps } from "@/components/ui/separator";
export { Heading, Text, Code, Blockquote } from "@/components/ui/typography";
export { Slot } from "@/components/ui/slot";
export { MetricCard, type MetricCardProps } from "@/components/ui/metric-card";
export { VerificationBadge, TrustCheckItem, type VerificationBadgeState } from "@/components/ui/verification-badge";
export { PipelineStepper, type PipelineStep } from "@/components/ui/pipeline-stepper";
export { AreaChart, type ChartPoint } from "@/components/ui/area-chart";
export { ProgressRing } from "@/components/ui/progress-ring";

const inputCls = "w-full rounded-sm border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none transition-colors";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-accent-700">{error}</span>}
    </label>
  );
}

export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={4} {...p} className={cn(inputCls, p.className)} />
);

export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn(inputCls, p.className)} />
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-4xl font-heading text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };

export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, empty = "Nothing here yet." }:
  { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; empty?: string }) {
  if (!rows.length) return <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-white shadow-xs">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            {columns.map((c) => <th key={c.header} className={cn("px-4 py-3 font-medium", c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-muted/50")}>
              {columns.map((c) => <td key={c.header} className={cn("px-4 py-3.5 align-middle", c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-sm border border-border bg-white p-0 shadow-2xl backdrop:bg-brand-950/60 backdrop:backdrop-blur-xs", wide ? "max-w-3xl" : "max-w-lg")}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-2xl font-heading text-foreground">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><X className="size-5" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{open && children}</div>
    </dialog>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-sm border border-border bg-white p-4.5 shadow-xs transition-all hover:border-brand-200">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="mt-1 font-heading text-3xl text-foreground tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export const ErrorNote = ({ message }: { message?: string | null }) =>
  message ? <p role="alert" className="rounded-sm border border-accent-100 bg-accent-50 px-3.5 py-2.5 text-sm text-accent-700">{message}</p> : null;

export const Spinner = () => <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-brand-600" aria-label="Loading" /></div>;
