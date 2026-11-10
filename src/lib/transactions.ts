// Pure helpers (no database access) so they can be unit-tested and used in the browser too.
export const STAGES = [
  "property_selected", "inspection_completed", "reservation_confirmed",
  "payment_received", "documentation_processing", "ownership_completed",
] as const;
export type Stage = (typeof STAGES)[number] | "cancelled";

export const STAGE_LABELS: Record<Stage, string> = {
  property_selected: "Property selected",
  inspection_completed: "Inspection completed",
  reservation_confirmed: "Reservation confirmed",
  payment_received: "Payment received",
  documentation_processing: "Documentation processing",
  ownership_completed: "Ownership documentation completed",
  cancelled: "Cancelled",
};

export const ALL_STAGES: Stage[] = [...STAGES, "cancelled"];

/** Position of a stage in the buying journey; cancelled is -1. */
export const stageIndex = (s: Stage) => (s === "cancelled" ? -1 : STAGES.indexOf(s));

export const outstanding = (priceKobo: number, paidKobo: number) => Math.max(0, priceKobo - paidKobo);

/** Returns a message when the move is not allowed, otherwise null. */
export function stageChangeProblem(to: Stage, t: { priceKobo: number; paidKobo: number }): string | null {
  if (to === "ownership_completed" && t.paidKobo < t.priceKobo) {
    return "Ownership can only be completed once the property is fully paid";
  }
  return null;
}

export type StepState = "done" | "current" | "todo";
/** The customer-facing progress list (PRD section 27). */
export function progress(stage: Stage): { stage: Stage; label: string; state: StepState }[] {
  const cur = stageIndex(stage);
  return STAGES.map((s, i) => ({
    stage: s, label: STAGE_LABELS[s],
    state: stage === "cancelled" ? "todo" : i < cur ? "done" : i === cur ? "current" : "todo",
  }));
}

/** Amount due this month on a payment plan: balance after deposit split over the months, capped at what is still owed. */
export function monthlyDue(p: { priceKobo: number; depositPercent: number | null; planMonths: number; outstandingKobo: number }): number {
  if (p.planMonths < 1) return 0;
  const deposit = Math.round((p.priceKobo * (p.depositPercent ?? 0)) / 100);
  const perMonth = Math.ceil((p.priceKobo - deposit) / p.planMonths);
  return Math.max(0, Math.min(perMonth, p.outstandingKobo));
}

export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
