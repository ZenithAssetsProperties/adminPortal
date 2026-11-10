import { Check, Circle, CircleDot } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui";
import type { StepState } from "@/lib/transactions";

export default function StageTimeline({ steps, cancelled }: { steps: { stage: string; label: string; state: StepState }[]; cancelled?: boolean }) {
  return (
    <div>
      {cancelled && <div className="mb-3"><Badge tone="red">cancelled</Badge></div>}
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.stage} className={clsx("flex items-center gap-3 text-sm", s.state === "todo" ? "text-brand-400" : "text-brand-900")}>
            {s.state === "done" ? <Check className="size-5 text-emerald-600" aria-label="Done" /> : s.state === "current" ? <CircleDot className="size-5 text-brand-600" aria-label="Current" /> : <Circle className="size-5" aria-label="Not yet" />}
            <span className={s.state === "current" ? "font-medium" : ""}>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
