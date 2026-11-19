import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-muted-foreground text-xs font-medium uppercase tracking-wider block mb-1", className)}
      {...props}
    />
  );
}
