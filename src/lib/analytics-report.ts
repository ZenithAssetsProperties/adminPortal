import { sql } from "drizzle-orm";
import { db } from "@/db";

const n = (v: unknown) => Number(v ?? 0);
const PURCHASED = ["payment_received", "documentation_processing", "ownership_completed"];

export type AnalyticsReport = Awaited<ReturnType<typeof buildReport>>;

/** All analytics numbers for the last `days` days (UTC day buckets). */
export async function buildReport(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const s = since.toISOString();
  const one = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows[0] as Record<string, unknown>;
  const many = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Record<string, unknown>[];
  const purchased = sql.raw(PURCHASED.map((x) => `'${x}'`).join(","));

  const [visitors, views, searches, started, paidPayments, enquiries, inspections, reservations, purchases, abandoned] = await Promise.all([
    one(sql`select count(distinct session_id)::int as v from analytics_events where type = 'visit' and created_at >= ${s}`),
    one(sql`select count(*)::int as v from analytics_events where type = 'property_view' and created_at >= ${s}`),
    one(sql`select count(*)::int as v from analytics_events where type = 'search' and created_at >= ${s}`),
    one(sql`select count(*)::int as v from analytics_events where type = 'payment_started' and created_at >= ${s}`),
    one(sql`select count(*)::int as v from payments where status = 'success' and paid_at >= ${s}`),
    one(sql`select count(*)::int as v from enquiries where created_at >= ${s}`),
    one(sql`select count(*)::int as v from inspections where created_at >= ${s}`),
    one(sql`select count(*)::int as v from reservations where created_at >= ${s}`),
    one(sql`select count(*)::int as v from transactions where stage in (${purchased}) and created_at >= ${s}`),
    one(sql`select count(*)::int as v from payments where status = 'pending' and created_at < now() - interval '1 hour' and created_at >= ${s}`),
  ]);

  const topProperties = await many(sql`
    select p.id, p.name, count(*)::int as views
    from analytics_events e join properties p on p.id = e.property_id
    where e.type = 'property_view' and e.created_at >= ${s}
    group by p.id, p.name order by views desc, p.name limit 10`);
  const topTerms = await many(sql`
    select lower(trim(meta->>'q')) as term, count(*)::int as searches
    from analytics_events where type = 'search' and created_at >= ${s} and coalesce(trim(meta->>'q'), '') <> ''
    group by 1 order by searches desc, term limit 10`);
  const channels = await many(sql`
    select source, sum(leads)::int as leads, sum(purchases)::int as purchases from (
      select coalesce(nullif(trim(source), ''), 'unknown') as source, count(*) as leads, 0 as purchases
        from leads where created_at >= ${s} group by 1
      union all
      select coalesce(nullif(trim(c.source), ''), 'unknown'), 0, count(*)
        from transactions t join customers c on c.id = t.customer_id
        where t.stage in (${purchased}) and t.created_at >= ${s} group by 1
    ) x group by source order by purchases desc, leads desc, source`);
  const daily = await many(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      (select count(distinct session_id)::int from analytics_events where type = 'visit' and (created_at at time zone 'UTC')::date = d) as visitors,
      (select count(*)::int from analytics_events where type = 'property_view' and (created_at at time zone 'UTC')::date = d) as views,
      (select count(*)::int from enquiries where (created_at at time zone 'UTC')::date = d) as enquiries
    from generate_series((${s}::timestamptz at time zone 'UTC')::date, (now() at time zone 'UTC')::date, interval '1 day') d
    order by d`);

  const started_ = n(started.v), paid_ = n(paidPayments.v);
  return {
    days, since: s,
    visitors: n(visitors.v), propertyViews: n(views.v), searches: n(searches.v),
    enquiries: n(enquiries.v), inspectionRequests: n(inspections.v), reservations: n(reservations.v), purchases: n(purchases.v),
    payment: { started: started_, successful: paid_, conversionPercent: started_ ? Math.round((paid_ / started_) * 100) : null },
    abandonedTransactions: n(abandoned.v),
    topProperties: topProperties.map((r) => ({ id: String(r.id), name: String(r.name), views: n(r.views) })),
    topSearchTerms: topTerms.map((r) => ({ term: String(r.term), searches: n(r.searches) })),
    channels: channels.map((r) => ({ source: String(r.source), leads: n(r.leads), purchases: n(r.purchases) })),
    daily: daily.map((r) => ({ day: String(r.day), visitors: n(r.visitors), views: n(r.views), enquiries: n(r.enquiries) })),
  };
}
