/** Optional sample data so a fresh local install is not empty. Never run this on production. */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to add demo data in production");
  const { db, schema } = await import("../src/db");
  const props = await db.insert(schema.properties).values([
    { slug: "the-seventh-residence", name: "The Seventh Residence", type: "apartment", purpose: "invest", status: "available", state: "Lagos", city: "Lekki", area: "Lekki Phase 1", priceKobo: 185_000_000_00, sizeSqm: 210, bedrooms: 3, bathrooms: 4, parking: 2, developmentStatus: "Completed", verified: true, verificationNotes: "Title and survey checked against the Lagos land registry.", featured: true, paymentPlanAvailable: true, minDepositPercent: 30, maxPlanMonths: 12, reservationFeeKobo: 2_000_000_00, description: "A quiet, light-filled residence minutes from the lagoon.", features: ["24h power", "Gym", "Concierge"] },
    { slug: "4-bedroom-detached-duplex", name: "4-Bedroom Detached Duplex", type: "house", status: "available", state: "Lagos", city: "Lekki", area: "Ajah", priceKobo: 150_000_000_00, sizeSqm: 380, landSizeSqm: 500, bedrooms: 4, bathrooms: 5, parking: 3, developmentStatus: "Completed", verified: true, featured: true, description: "Detached duplex with a boys' quarters and generous garden." },
    { slug: "ikoyi-commercial-floor", name: "Ikoyi Commercial Floor", type: "commercial", status: "reserved", state: "Lagos", city: "Ikoyi", priceKobo: 420_000_000_00, sizeSqm: 650, developmentStatus: "Completed" },
    { slug: "epe-residential-plots", name: "Epe Residential Plots", type: "land", purpose: "invest", status: "available", state: "Lagos", city: "Epe", priceKobo: 18_000_000_00, landSizeSqm: 600, priceReduced: true, paymentPlanAvailable: true, minDepositPercent: 20, maxPlanMonths: 18, description: "Dry, serviced plots with survey and allocation." },
    { slug: "abuja-maitama-terrace", name: "Maitama Terrace", type: "house", status: "sold", state: "FCT", city: "Abuja", area: "Maitama", priceKobo: 310_000_000_00, bedrooms: 5, bathrooms: 6 },
    { slug: "new-listing-draft", name: "Banana Island Penthouse (draft)", type: "apartment", status: "draft", state: "Lagos", city: "Ikoyi", priceKobo: 900_000_000_00, bedrooms: 4 },
  ]).returning();
  const [c1, c2] = await db.insert(schema.customers).values([
    { fullName: "Adaeze Okafor", email: "adaeze@example.com", phone: "08031234567", emailVerified: true, source: "instagram" },
    { fullName: "Tunde Bello (UK)", email: "tunde@example.com", phone: "+447700900123", isDiaspora: true, country: "United Kingdom", source: "referral" },
  ]).returning();
  const leads = await db.insert(schema.leads).values([
    { name: c1.fullName, email: c1.email, phone: c1.phone, customerId: c1.id, propertyId: props[0].id, source: "instagram", status: "inspection_scheduled" },
    { name: c2.fullName, email: c2.email, customerId: c2.id, propertyId: props[1].id, source: "referral", status: "negotiation" },
    { name: "Ngozi Eze", phone: "08055550000", propertyId: props[3].id, source: "website", status: "new" },
  ]).returning();
  await db.insert(schema.enquiries).values([
    { kind: "enquiry", name: "Ngozi Eze", phone: "08055550000", message: "Is the Epe plot still available? Can I pay in instalments?", propertyId: props[3].id, leadId: leads[2].id, source: "website" },
    { kind: "consultation", name: "Chidi Obi", email: "chidi@example.com", message: "I would like to speak with a consultant about investing.", source: "whatsapp" },
  ]);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await db.insert(schema.inspections).values([
    { propertyId: props[0].id, customerId: c1.id, leadId: leads[0].id, name: c1.fullName, phone: c1.phone!, email: c1.email, preferredDate: tomorrow, preferredTime: "11:00", visitors: 2 },
    { propertyId: props[1].id, customerId: c2.id, kind: "virtual", name: c2.fullName, phone: "+447700900123", preferredDate: tomorrow, preferredTime: "16:00", visitors: 1, status: "confirmed" },
  ]);
  const [t] = await db.insert(schema.transactions).values({ reference: "TXN-DEMO-0001", customerId: c2.id, propertyId: props[2].id, priceKobo: props[2].priceKobo, stage: "reservation_confirmed" }).returning();
  const [pay] = await db.insert(schema.payments).values({ reference: "PAY-DEMO-0001", transactionId: t.id, customerId: c2.id, kind: "reservation", amountKobo: 5_000_000_00, status: "success", method: "bank_transfer", paidAt: new Date() }).returning();
  await db.insert(schema.receipts).values({ number: "RCP-DEMO-0001", paymentId: pay.id });
  await db.insert(schema.reservations).values({ propertyId: props[2].id, customerId: c2.id, status: "active", amountKobo: 5_000_000_00, expiresAt: new Date(Date.now() + 5 * 86_400_000) });
  console.log("Demo data added.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
