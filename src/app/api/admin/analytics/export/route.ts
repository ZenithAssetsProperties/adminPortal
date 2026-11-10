import { z } from "zod";
import { adminRoute, parseQuery } from "@/lib/http";
import { buildReport } from "@/lib/analytics-report";
import { csvRow } from "@/lib/documents";

const Q = z.object({ days: z.enum(["7", "30", "90"]).default("30").transform(Number) });

export const GET = adminRoute("analytics.read", async ({ req }) => {
  const r = await buildReport(parseQuery(req, Q).days);
  const lines = [
    csvRow(["Metric", "Value"]),
    ...([["Period (days)", r.days], ["Visitors", r.visitors], ["Property views", r.propertyViews], ["Searches", r.searches], ["Enquiries", r.enquiries],
      ["Inspection requests", r.inspectionRequests], ["Reservations", r.reservations], ["Purchases", r.purchases],
      ["Payments started", r.payment.started], ["Payments successful", r.payment.successful], ["Abandoned payments", r.abandonedTransactions]] as const).map((x) => csvRow([...x])),
    "", csvRow(["Day", "Visitors", "Property views", "Enquiries"]),
    ...r.daily.map((d) => csvRow([d.day, d.visitors, d.views, d.enquiries])),
    "", csvRow(["Most viewed property", "Views"]), ...r.topProperties.map((p) => csvRow([p.name, p.views])),
    "", csvRow(["Channel", "Leads", "Purchases"]), ...r.channels.map((c) => csvRow([c.source, c.leads, c.purchases])),
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zenith-analytics-${r.days}d.csv"` } });
});
