import { AlertTriangle, CheckCircle2, Clock, Lock, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type VerificationBadgeState =
  | "verified"
  | "agent_assigned"
  | "pending_review"
  | "unverified"
  | "rejected"
  | "sealed"
  | "tampered";

const CONFIG: Record<
  VerificationBadgeState,
  { label: string; cls: string; icon: typeof ShieldCheck }
> = {
  verified: {
    label: "Verified Listing",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: ShieldCheck,
  },
  sealed: {
    label: "Cryptographically Sealed",
    cls: "bg-brand-50 text-brand-800 border-brand-200",
    icon: Lock,
  },
  agent_assigned: {
    label: "Agent Assigned",
    cls: "bg-blue-50 text-blue-800 border-blue-200",
    icon: UserCheck,
  },
  pending_review: {
    label: "Pending Admin Review",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Clock,
  },
  unverified: {
    label: "Unverified Draft",
    cls: "bg-stone-100 text-stone-700 border-stone-200",
    icon: AlertTriangle,
  },
  rejected: {
    label: "Rejected",
    cls: "bg-accent-50 text-accent-700 border-accent-100",
    icon: ShieldAlert,
  },
  tampered: {
    label: "Integrity Alert",
    cls: "bg-accent-50 text-accent-700 border-accent-200",
    icon: ShieldAlert,
  },
};

export function VerificationBadge({
  state,
  label,
  className,
}: {
  state: VerificationBadgeState;
  label?: string;
  className?: string;
}) {
  const cfg = CONFIG[state] ?? CONFIG.unverified;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        cfg.cls,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label ?? cfg.label}
    </span>
  );
}

export function TrustCheckItem({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      )}
      <div>
        <div className={cn("font-medium", ok ? "text-foreground" : "text-muted-foreground")}>{label}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
    </div>
  );
}
