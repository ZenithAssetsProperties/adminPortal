"use client";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({ variant = "primary", loading, className, children, disabled, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean }) {
  const styles = {
    primary: "bg-brand-700 text-white hover:bg-brand-800",
    secondary: "border border-brand-200 bg-white text-brand-800 hover:bg-brand-50",
    danger: "bg-accent-600 text-white hover:bg-accent-700",
    ghost: "text-brand-700 hover:bg-brand-50",
  }[variant];
  return (
    <button {...p} disabled={disabled || loading}
      className={clsx("inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", styles, className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const inputCls = "w-full border border-brand-200 bg-white px-3 py-2 text-sm text-brand-950 placeholder:text-brand-300 focus:border-brand-500";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-600">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-brand-400">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-accent-700">{error}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={4} {...p} className={clsx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(inputCls, p.className)} />;

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("border border-line bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-xl text-brand-900">{title}</h2>{actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-4xl text-brand-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-brand-500">{subtitle}</p>}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-accent-50 text-accent-700 border-accent-100",
  blue: "bg-brand-50 text-brand-700 border-brand-200",
  grey: "bg-stone-100 text-stone-700 border-stone-200",
};
export function Badge({ tone = "grey", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx("inline-block border px-2 py-0.5 text-xs font-medium capitalize", tones[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof tones> = {
  available: "green", approved: "green", success: "green", confirmed: "green", completed: "green", active: "green", purchased: "green", ownership_completed: "green",
  reserved: "amber", pending: "amber", requested: "amber", new: "blue", contacted: "blue", negotiation: "amber", inspection_scheduled: "amber",
  sold: "grey", draft: "grey", expired: "grey", converted: "green",
  cancelled: "red", failed: "red", rejected: "red", denied: "red", lost: "red", abandoned: "red",
};
export const StatusBadge = ({ value }: { value: string }) => <Badge tone={STATUS_TONE[value] ?? "blue"}>{value.replaceAll("_", " ")}</Badge>;

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string };
export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, empty = "Nothing here yet." }:
  { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; empty?: string }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-brand-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-brand-500">
            {columns.map((c) => <th key={c.header} className={clsx("px-3 py-2 font-medium", c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={clsx("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-brand-50")}>
              {columns.map((c) => <td key={c.header} className={clsx("px-3 py-3 align-top", c.className)}>{c.cell(r)}</td>)}
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
      className={clsx("m-auto w-[calc(100%-2rem)] border border-line bg-white p-0 backdrop:bg-brand-950/50", wide ? "max-w-3xl" : "max-w-lg")}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-2xl text-brand-900">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="p-1 text-brand-500 hover:text-brand-900"><X className="size-5" /></button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{open && children}</div>
    </dialog>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="border border-line bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-brand-500">{label}</div>
      <div className="mt-1 font-heading text-3xl text-brand-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-brand-400">{sub}</div>}
    </div>
  );
}

export const ErrorNote = ({ message }: { message?: string | null }) =>
  message ? <p role="alert" className="border border-accent-100 bg-accent-50 px-3 py-2 text-sm text-accent-700">{message}</p> : null;
export const Spinner = () => <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-brand-400" aria-label="Loading" /></div>;
