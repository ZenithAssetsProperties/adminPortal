import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatNaira } from "@/lib/money";
import { notifyCustomer } from "@/lib/notify";
import type { PropertyRow } from "@/lib/public-dto";

/** Tell customers whose saved alert matches a newly available property. */
export async function notifyMatchingAlerts(p: PropertyRow) {
  if (p.status !== "available" || p.deletedAt) return;
  const rows = await db.select().from(schema.alerts).where(eq(schema.alerts.active, true)).limit(1000);
  for (const a of rows) {
    const c = a.criteria;
    const ok =
      (!c.city || c.city.toLowerCase() === p.city.toLowerCase()) &&
      (!c.state || c.state.toLowerCase() === p.state.toLowerCase()) &&
      (!c.type || c.type === p.type) &&
      (c.minBedrooms == null || (p.bedrooms ?? 0) >= c.minBedrooms) &&
      (c.maxPriceKobo == null || p.priceKobo <= c.maxPriceKobo);
    if (ok) {
      await notifyCustomer(a.customerId, {
        type: "alert_match", title: "A new property matches your alert",
        body: `${p.name} in ${[p.area, p.city].filter(Boolean).join(", ")} is now available at ${formatNaira(p.priceKobo)}.`,
      });
    }
  }
}

async function favoriteOwners(propertyId: string) {
  return db.select({ id: schema.favorites.customerId }).from(schema.favorites).where(eq(schema.favorites.propertyId, propertyId));
}

/** React to an admin edit: price change, no longer available, newly available. Never throws. */
export async function handlePropertyChange(before: PropertyRow | null, after: PropertyRow) {
  try {
    if (after.deletedAt) return;
    if (after.status === "available" && (!before || before.status !== "available")) await notifyMatchingAlerts(after);
    if (!before) return;
    if (before.priceKobo !== after.priceKobo) {
      const dir = after.priceKobo < before.priceKobo ? "dropped" : "changed";
      for (const f of await favoriteOwners(after.id)) {
        await notifyCustomer(f.id, { type: "price_change", title: "A saved property's price changed", body: `${after.name} price ${dir} from ${formatNaira(before.priceKobo)} to ${formatNaira(after.priceKobo)}.` });
      }
    }
    if (before.status === "available" && ["reserved", "sold", "draft"].includes(after.status)) {
      for (const f of await favoriteOwners(after.id)) {
        await notifyCustomer(f.id, { type: "property_unavailable", title: "A saved property is no longer available", body: `${after.name} is now ${after.status === "draft" ? "unavailable" : after.status}.` });
      }
    }
  } catch (e) { console.error("handlePropertyChange failed", e); }
}

