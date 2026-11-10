/* eslint-disable @typescript-eslint/no-explicit-any -- live API responses are untyped JSON */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { anon, makeProperty, BASE } from "./helpers";
import { makeDoc, resetRateLimits, uniq } from "./v1-helpers";

const tag = `City${uniq()}`;
let visible: Awaited<ReturnType<typeof makeProperty>>;
let draft: Awaited<ReturnType<typeof makeProperty>>;
let planned: Awaited<ReturnType<typeof makeProperty>>;
let big: Awaited<ReturnType<typeof makeProperty>>;

beforeAll(async () => {
  await resetRateLimits();
  visible = await makeProperty({ city: tag, name: `Visible ${tag}`, latitude: "6.4541", longitude: "3.3947", coverImage: "properties/x/secret-cover.jpg", bedrooms: 4, bathrooms: 3, priceKobo: 20_000_000_000, featured: true, verificationNotes: "Title verified at the land registry", verified: true });
  draft = await makeProperty({ city: tag, name: `Draft ${tag}`, status: "draft" });
  planned = await makeProperty({ city: tag, name: `Planned ${tag}`, paymentPlanAvailable: true, minDepositPercent: 30, maxPlanMonths: 12, priceKobo: 10_000_000_000, bedrooms: 2, type: "apartment" });
  big = await makeProperty({ city: tag, name: `Big ${tag}`, priceKobo: 90_000_000_000, landSizeSqm: 900, type: "land" });
});

const list = (qs: string) => anon(`/api/v1/properties?city=${tag}&${qs}`);

describe("GET /api/v1/properties", () => {
  it("hides drafts and never leaks staff-only or storage fields", async () => {
    const r = await list("pageSize=50");
    expect(r.status).toBe(200);
    const names = r.json.items.map((i: any) => i.name);
    expect(names).toContain(visible.name);
    expect(names).not.toContain(draft.name);
    const raw = JSON.stringify(r.json);
    for (const bad of ["latitude", "longitude", "agentId", "createdBy", "verificationNotes", "6.4541", "storageKey", "coverImage"]) expect(raw).not.toContain(bad);
    expect(r.json.items.find((i: any) => i.id === visible.id).coverUrl).toContain("/api/files?key=");
  });

  it("filters by type, bedrooms, price range and land size", async () => {
    expect((await list("type=apartment")).json.total).toBe(1);
    expect((await list("bedrooms=3")).json.items.map((i: any) => i.id)).toEqual([visible.id]);
    const range = await list(`minPrice=15000000000&maxPrice=25000000000`);
    expect(range.json.items.map((i: any) => i.id)).toEqual([visible.id]);
    expect((await list("minLand=500")).json.items.map((i: any) => i.id)).toEqual([big.id]);
    expect((await list("paymentPlan=true")).json.items.map((i: any) => i.id)).toEqual([planned.id]);
    expect((await list("collection=featured")).json.items.map((i: any) => i.id)).toEqual([visible.id]);
  });

  it("sorts, paginates and treats % in search literally", async () => {
    const asc = await list("sort=price_asc&pageSize=50");
    const prices = asc.json.items.map((i: any) => i.priceKobo);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const p2 = await list("sort=price_asc&pageSize=2&page=2");
    expect(p2.json.items).toHaveLength(1);
    expect(p2.json.total).toBe(3);
    expect((await list("q=%25")).json.total).toBe(0);
    expect((await list("availability=nonsense")).status).toBe(400);
    expect((await anon(`/api/v1/properties?pageSize=1000`)).status).toBe(400);
  });
});

describe("GET /api/v1/properties/[slug]", () => {
  it("returns details without coordinates, and 404 for drafts", async () => {
    expect((await anon(`/api/v1/properties/${draft.slug}`)).status).toBe(404);
    const r = await anon(`/api/v1/properties/${visible.slug}`);
    expect(r.status).toBe(200);
    expect(r.json.verification).toEqual({ verified: true, explanation: "Title verified at the land registry" });
    const raw = JSON.stringify(r.json);
    for (const bad of ["latitude", "longitude", "agentId", "createdBy", "6.4541", "coverImage", "storageKey"]) expect(raw).not.toContain(bad);
  });

  it("shows documentation STATUS only: approved docs, no keys or links, pending docs hidden", async () => {
    const approved = await makeDoc({ propertyId: visible.id, kind: "survey_plan", visibility: "request_only", storageKey: "documents/test/very-secret-survey.pdf" });
    await makeDoc({ propertyId: visible.id, kind: "deed_of_assignment", status: "pending" });
    const r = await anon(`/api/v1/properties/${visible.slug}`);
    expect(r.json.documentation).toHaveLength(1);
    expect(r.json.documentation[0]).toMatchObject({ kind: "survey_plan", status: "Verified / Available for review", accessRequired: true });
    expect(JSON.stringify(r.json)).not.toContain("very-secret-survey");
    expect(r.json.documentation[0].documentId).toBeUndefined();
    expect(approved.id).toBeTruthy();
  });

  it("flags investment figures as estimates", async () => {
    const inv = await makeProperty({ purpose: "invest", investment: { rentalPotential: "8% yearly" } });
    const r = await anon(`/api/v1/properties/${inv.slug}`);
    expect(r.json.investment.disclaimer).toMatch(/estimates/i);
  });
});

describe("payment plan calculator", () => {
  it("computes from the server's price and respects the property's limits", async () => {
    const ok = await anon(`/api/v1/properties/${planned.slug}/payment-plan?deposit=30&months=12`);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ depositKobo: 3_000_000_000, balanceKobo: 7_000_000_000, monthlyKobo: 583_333_334, months: 12 });
    expect((await anon(`/api/v1/properties/${planned.slug}/payment-plan?deposit=10&months=12`)).status).toBe(400); // below min deposit
    expect((await anon(`/api/v1/properties/${planned.slug}/payment-plan?deposit=30&months=24`)).status).toBe(400); // too long
    expect((await anon(`/api/v1/properties/${planned.slug}/payment-plan?deposit=abc&months=12`)).status).toBe(400);
    expect((await anon(`/api/v1/properties/${visible.slug}/payment-plan?deposit=30&months=6`)).status).toBe(400); // no plan offered
  });
});

describe("GET /api/v1/compare", () => {
  it("compares 2-4 properties", async () => {
    const r = await anon(`/api/v1/compare?slugs=${visible.slug},${planned.slug}`);
    expect(r.status).toBe(200);
    expect(r.json.items.map((i: any) => i.slug)).toEqual([visible.slug, planned.slug]);
    expect((await anon(`/api/v1/compare?slugs=${visible.slug}`)).status).toBe(400);
    expect((await anon(`/api/v1/compare?slugs=a,b,c,d,e`)).status).toBe(400);
    expect((await anon(`/api/v1/compare?slugs=${visible.slug},${draft.slug}`)).status).toBe(400);
  });
});

describe("POST /api/v1/enquiries", () => {
  it("creates an enquiry and a lead", async () => {
    const email = `enq-${uniq()}@example.com`;
    const r = await anon("/api/v1/enquiries", { body: { kind: "callback", name: "Ada Obi", email, message: "Call me", propertySlug: visible.slug, source: "instagram" } });
    expect(r.status).toBe(201);
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, r.json.leadId));
    expect(lead).toMatchObject({ source: "instagram", status: "new", propertyId: visible.id, email });
  });
  it("needs a way to reach the person and silently drops honeypot posts", async () => {
    expect((await anon("/api/v1/enquiries", { body: { name: "No Contact" } })).status).toBe(400);
    const email = `bot-${uniq()}@example.com`;
    const r = await anon("/api/v1/enquiries", { body: { name: "Bot Bot", email, website: "http://spam.example" } });
    expect(r.status).toBe(200);
    expect(await db.select().from(schema.enquiries).where(eq(schema.enquiries.email, email))).toHaveLength(0);
  });
});

describe("POST /api/v1/inspections", () => {
  const future = () => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const form = (over: object = {}) => ({ propertySlug: visible.slug, name: "Chidi Eze", phone: "08031234567", email: `i-${uniq()}@example.com`, preferredDate: future(), preferredTime: "14:30", visitors: 2, ...over });

  it("books an inspection and returns the confirmation wording from the PRD", async () => {
    const r = await anon("/api/v1/inspections", { body: form() });
    expect(r.status).toBe(201);
    expect(r.json.message).toBe("Your inspection request has been received. A Zenith Asset Group representative will contact you to confirm your appointment.");
    const [row] = await db.select().from(schema.inspections).where(eq(schema.inspections.id, r.json.inspectionId));
    expect(row).toMatchObject({ status: "requested", visitors: 2, kind: "physical" });
    const sent = await db.select().from(schema.messageLog).where(eq(schema.messageLog.recipient, "08031234567"));
    expect(sent.length).toBeGreaterThan(0);
  });
  it("rejects past dates, bad times, too many visitors and drafts; ignores honeypot", async () => {
    expect((await anon("/api/v1/inspections", { body: form({ preferredDate: "2020-01-01" }) })).status).toBe(400);
    expect((await anon("/api/v1/inspections", { body: form({ preferredTime: "25:99" }) })).status).toBe(400);
    expect((await anon("/api/v1/inspections", { body: form({ visitors: 21 }) })).status).toBe(400);
    expect((await anon("/api/v1/inspections", { body: form({ propertySlug: draft.slug }) })).status).toBe(404);
    const email = `hp-${uniq()}@example.com`;
    expect((await anon("/api/v1/inspections", { body: form({ email, website: "x" }) })).status).toBe(200);
    expect(await db.select().from(schema.inspections).where(eq(schema.inspections.email, email))).toHaveLength(0);
  });
});

describe("POST /api/v1/analytics/events", () => {
  it("accepts valid events (single or batch) and links a property by slug", async () => {
    const sessionId = `s-${uniq()}`;
    expect((await anon("/api/v1/analytics/events", { body: { type: "property_view", propertySlug: visible.slug, sessionId, source: "google" } })).json).toMatchObject({ accepted: 1 });
    expect((await anon("/api/v1/analytics/events", { body: { events: [{ type: "visit", sessionId }, { type: "search", sessionId, meta: { q: "lekki" } }] } })).json.accepted).toBe(2);
    const rows = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.sessionId, sessionId));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.type === "property_view")?.propertyId).toBe(visible.id);
  });
  it("rejects unknown event types and oversized batches", async () => {
    expect((await anon("/api/v1/analytics/events", { body: { type: "hack" } })).status).toBe(400);
    expect((await anon("/api/v1/analytics/events", { body: { events: Array.from({ length: 21 }, () => ({ type: "visit" })) } })).status).toBe(400);
  });
});

describe("CORS", () => {
  it("echoes only allowed origins", async () => {
    const ok = await fetch(`${BASE}/api/v1/properties`, { method: "OPTIONS", headers: { Origin: "https://zenithassetsproperties.netlify.app" } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://zenithassetsproperties.netlify.app");
    const bad = await fetch(`${BASE}/api/v1/properties`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});
