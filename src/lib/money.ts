/** All money is stored as whole kobo (integer) to avoid rounding errors. */
export const nairaToKobo = (naira: number) => Math.round(naira * 100);
export const koboToNaira = (kobo: number) => kobo / 100;

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 })
    .format(kobo / 100);
}

export type PaymentPlan = { depositKobo: number; balanceKobo: number; months: number; monthlyKobo: number };

/** Payment-plan calculator. The monthly figure is rounded up so the plan never under-collects. */
export function paymentPlan(priceKobo: number, depositPercent: number, months: number): PaymentPlan {
  if (!Number.isInteger(priceKobo) || priceKobo <= 0) throw new Error("Invalid price");
  if (depositPercent < 0 || depositPercent > 100) throw new Error("Invalid deposit percent");
  if (!Number.isInteger(months) || months < 1) throw new Error("Invalid months");
  const depositKobo = Math.round((priceKobo * depositPercent) / 100);
  const balanceKobo = priceKobo - depositKobo;
  return { depositKobo, balanceKobo, months, monthlyKobo: Math.ceil(balanceKobo / months) };
}

export function makeReference(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${rand[0].toString(36).toUpperCase()}${rand[1].toString(36).toUpperCase()}`.slice(0, 28);
}
