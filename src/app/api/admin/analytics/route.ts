import { z } from "zod";
import { adminRoute, parseQuery } from "@/lib/http";
import { buildReport } from "@/lib/analytics-report";

const RangeQuery = z.object({ days: z.enum(["7", "30", "90"]).default("30").transform(Number) });

export const GET = adminRoute("analytics.read", async ({ req }) => buildReport(parseQuery(req, RangeQuery).days));
