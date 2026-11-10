"use client";
import { use } from "react";
import { Printer } from "lucide-react";
import { Button, ErrorNote, Spinner } from "@/components/ui";
import { fmtDate, naira, useApi } from "@/lib/client";

type Receipt = {
  receiptNumber: string; issuedAt: string; paymentReference: string; paidAt: string | null; method: string | null; kind: string; amountKobo: number;
  transactionReference: string; priceKobo: number; totalPaidKobo: number; balanceKobo: number;
  customer: { fullName: string; email: string; phone: string | null }; property: { name: string; city: string; area: string | null };
};

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useApi<Receipt>(`/api/admin/payments/${id}/receipt`);
  if (loading) return <Spinner />;
  if (!data) return <ErrorNote message={error ?? "Receipt not found"} />;
  const row = (k: string, v: string) => <div className="flex justify-between gap-6 border-b border-line py-2 text-sm"><span className="text-brand-500">{k}</span><span className="text-right font-medium text-brand-900">{v}</span></div>;
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex justify-end print:hidden"><Button onClick={() => window.print()}><Printer className="size-4" /> Print</Button></div>
      <article className="border border-line bg-white p-8 print:border-0 print:p-0">
        <header className="mb-6 flex items-end justify-between border-b-2 border-brand-700 pb-4">
          <div><div className="font-heading text-3xl text-brand-900">Zenith</div><div className="text-[10px] uppercase tracking-[0.25em] text-brand-500">Asset Group · Property &amp; investment</div></div>
          <div className="text-right"><div className="text-xs uppercase tracking-wide text-brand-500">Receipt</div><div className="font-mono text-sm">{data.receiptNumber}</div></div>
        </header>
        {row("Received from", data.customer.fullName)}
        {row("Property", [data.property.name, data.property.area, data.property.city].filter(Boolean).join(", "))}
        {row("Transaction", data.transactionReference)}
        {row("Payment reference", data.paymentReference)}
        {row("Date paid", fmtDate(data.paidAt ?? data.issuedAt))}
        {row("Payment type", `${data.kind}${data.method ? ` (${data.method.replace("_", " ")})` : ""}`)}
        <div className="my-6 bg-brand-50 p-4 text-center"><div className="text-xs uppercase tracking-wide text-brand-500">Amount paid</div><div className="font-heading text-4xl text-brand-900">{naira(data.amountKobo)}</div></div>
        {row("Purchase price", naira(data.priceKobo))}
        {row("Total paid to date", naira(data.totalPaidKobo))}
        {row("Outstanding balance", naira(data.balanceKobo))}
        <p className="mt-6 text-center text-xs text-brand-400">Thank you for choosing Zenith Asset Group. This receipt was generated electronically.</p>
      </article>
    </div>
  );
}
