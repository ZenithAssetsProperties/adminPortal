import type { HTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative flex gap-3 rounded-sm border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-brand-200 bg-brand-50 text-brand-900",
      success:
        "border-emerald-200 bg-emerald-50 text-emerald-900",
      warning:
        "border-amber-200 bg-amber-50 text-amber-900",
      destructive:
        "border-accent-100 bg-accent-50 text-accent-700",
    },
  },
  defaultVariants: { variant: "info" },
});

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
} as const;

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const Icon = alertIcons[variant ?? "info"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {title && <p className="leading-none font-medium">{title}</p>}
        {children && <div className="text-sm opacity-90">{children}</div>}
      </div>
    </div>
  );
}
