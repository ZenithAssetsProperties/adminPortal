import { desc } from "drizzle-orm";
import { schema } from "@/db";
import { adminRoute, parseQuery } from "@/lib/http";
import { PaymentQuery, csvCell, paymentFilters, paymentSelect } from "@/lib/payments-query";

export const GET = adminRoute("payments.read", async ({ req }) => {
  const q = parseQuery(req, PaymentQuery);
  const rows = await paymentSelect().where(paymentFilters(q)).orderBy(desc(schema.payments.createdAt)).limit(10_000);
  const head = ["Reference", "Date", "Customer", "Property", "Transaction", "Kind", "Method", "Status", "Amount (NGN)"];
  const lines = rows.map((r) => [
    r.p.reference, (r.p.paidAt ?? r.p.createdAt).toISOString(), r.customerName, r.propertyName, r.transactionRef,
    r.p.kind, r.p.method ?? "", r.p.status, (r.p.amountKobo / 100).toFixed(2),
  ].map(csvCell).join(","));
  return new Response([head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payments.csv"' },
  });
});
