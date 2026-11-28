import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "bg-brand-100 text-brand-800 border border-brand-200",
        success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
        warning: "bg-amber-50 text-amber-800 border border-amber-200",
        destructive: "bg-accent-50 text-accent-700 border border-accent-100",
        outline: "border border-border text-foreground bg-white",
        grey: "bg-stone-100 text-stone-700 border border-stone-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  tone?: "green" | "amber" | "red" | "blue" | "grey";
}

const toneToVariant = {
  green: "success",
  amber: "warning",
  red: "destructive",
  blue: "default",
  grey: "grey",
} as const;

export function Badge({ className, variant, tone, dot, children, ...props }: BadgeProps) {
  const chosenVariant = tone ? toneToVariant[tone] : variant;
  return (
    <span className={cn(badgeVariants({ variant: chosenVariant }), className)} {...props}>
      {dot && (
        <span className="relative flex size-1.5">
          <span className="bg-accent-500 absolute inline-flex size-full animate-ping rounded-full opacity-75" />
          <span className="bg-accent-600 relative inline-flex size-1.5 rounded-full" />
        </span>
      )}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "blue" | "grey"> = {
  available: "green", approved: "green", success: "green", confirmed: "green", completed: "green", active: "green", purchased: "green", ownership_completed: "green",
  reserved: "amber", pending: "amber", requested: "amber", new: "blue", in_review: "blue", contacted: "blue", negotiation: "amber", inspection_scheduled: "amber",
  sold: "grey", draft: "grey", expired: "grey", converted: "green",
  cancelled: "red", failed: "red", rejected: "red", denied: "red", lost: "red", abandoned: "red",
};

export const StatusBadge = ({ value }: { value: string }) => (
  <Badge tone={STATUS_TONE[value] ?? "blue"}>{value.replaceAll("_", " ")}</Badge>
);
