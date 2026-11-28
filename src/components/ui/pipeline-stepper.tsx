import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineStep = {
  id: string;
  label: string;
  state: "done" | "current" | "pending" | "error";
};

export function PipelineStepper({ steps, className }: { steps: PipelineStep[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                step.state === "done" && "bg-emerald-600 text-white",
                step.state === "current" && "bg-brand-700 text-white ring-2 ring-brand-200",
                step.state === "pending" && "bg-muted text-muted-foreground",
                step.state === "error" && "bg-accent-600 text-white",
              )}
            >
              {step.state === "done" ? <Check className="size-3" /> : idx + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                step.state === "done" && "text-emerald-800",
                step.state === "current" && "text-brand-900",
                step.state === "pending" && "text-muted-foreground",
                step.state === "error" && "text-accent-700",
              )}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && <span className="h-px w-4 bg-border" aria-hidden />}
        </div>
      ))}
    </div>
  );
}
