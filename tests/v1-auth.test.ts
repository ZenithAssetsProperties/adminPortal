import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { signEmailToken, signResetToken, newPhoneOtp } from "@/lib/customer-auth";
import { signCustomer } from "@/lib/auth/session";
import { anon, asCustomer } from "./helpers";
import { customerWithPassword, resetRateLimits, uniq } from "./v1-helpers";

const PW = "Str0ng-Passw0rd!";
beforeAll(resetRateLimits);

describe("registration and login", () => {
  it("registers, answers the same for a repeat email, and logs in", async () => {
    const email = `reg-${uniq()}@example.com`;
    const body = { fullName: "Ngozi Eze", email, phone: "08031112222", password: PW };
    const first = await anon("/api/v1/auth/register", { body });
    const again = await anon("/api/v1/auth/register", { body: { ...body, fullName: "Someone Else" } });
    expect(first.status).toBe(201);
    expect(again.status).toBe(first.status);       // no way to tell which emails are registered
    expect(again.json).toEqual(first.json);
    const rows = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe("Ngozi Eze");     // repeat did not overwrite the real account
    expect(rows[0].passwordHash).not.toBe(PW);

    const login = await anon("/api/v1/auth/login", { body: { email, password: PW } });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.json)).not.toMatch(/passwordHash|tokenVersion/);
    const me = await asCustomer(login.json.token, "/api/v1/me");
    expect(me.json.email).toBe(email);
    expect(JSON.stringify(me.json)).not.toMatch(/passwordHash|tokenVersion/);
  });

  it("rejects weak passwords and bad input", async () => {
    const base = { fullName: "Weak Pw", email: `w-${uniq()}@example.com`, phone: "08031112222" };
    expect((await anon("/api/v1/auth/register", { body: { ...base, password: "short" } })).status).toBe(400);
    expect((await anon("/api/v1/auth/register", { body: { ...base, password: "alllowercase12345" } })).status).toBe(400);
    expect((await anon("/api/v1/auth/register", { body: { ...base, email: "nope", password: PW } })).status).toBe(400);
  });

  it("gives one generic error for wrong password and unknown email", async () => {
    const c = await customerWithPassword(PW);
    const wrong = await anon("/api/v1/auth/login", { body: { email: c.email, password: "Wrong-Passw0rd!!" } });
    const none = await anon("/api/v1/auth/login", { body: { email: `nobody-${uniq()}@example.com`, password: PW } });
    expect(wrong.status).toBe(401); expect(none.status).toBe(401);
    expect(wrong.json.error).toBe(none.json.error);
  });

  it("locks an email out after repeated attempts, even with the right password", async () => {
    const c = await customerWithPassword(PW);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await anon("/api/v1/auth/login", { body: { email: c.email, password: "Wrong-Passw0rd!!" } })).status;
    expect(last).toBe(429);
    expect((await anon("/api/v1/auth/login", { body: { email: c.email, password: PW } })).status).toBe(429);
  });

  it("blocked customers cannot log in or use an existing token", async () => {
    const c = await customerWithPassword(PW);
    await db.update(schema.customers).set({ blocked: true }).where(eq(schema.customers.id, c.id));
    expect((await anon("/api/v1/auth/login", { body: { email: c.email, password: PW } })).status).toBe(401);
    expect((await asCustomer(c.token, "/api/v1/me")).status).toBe(401);
  });
});

describe("profile and password change", () => {
  it("updates the profile; changing the phone clears phone verification", async () => {
    const c = await customerWithPassword(PW);
    await db.update(schema.customers).set({ phoneVerified: true }).where(eq(schema.customers.id, c.id));
    const r = await asCustomer(c.token, "/api/v1/me", { method: "PATCH", body: { fullName: "New Name", phone: "08099998888", isDiaspora: true } });
    expect(r.json).toMatchObject({ fullName: "New Name", phone: "08099998888", phoneVerified: false, isDiaspora: true });
    // cannot sneak in protected fields
    const sneaky = await asCustomer(c.token, "/api/v1/me", { method: "PATCH", body: { fullName: "X Y", emailVerified: true, blocked: false, idVerified: true } });
    expect(sneaky.json.emailVerified).toBe(false);
    expect(sneaky.json.idVerified).toBe(false);
  });

  it("changing the password signs out old sessions and returns a fresh token", async () => {
    const c = await customerWithPassword(PW);
    const NEW = "Another-Str0ng-One!";
    expect((await asCustomer(c.token, "/api/v1/auth/change-password", { body: { current: "wrong-wrong-1A", next: NEW } })).status).toBe(401);
    const r = await asCustomer(c.token, "/api/v1/auth/change-password", { body: { current: PW, next: NEW } });
    expect(r.status).toBe(200);
    expect((await asCustomer(c.token, "/api/v1/me")).status).toBe(401);           // old session ended
    expect((await asCustomer(r.json.token, "/api/v1/me")).status).toBe(200);      // new one works
    expect((await anon("/api/v1/auth/login", { body: { email: c.email, password: NEW } })).status).toBe(200);
  });
});

describe("password reset", () => {
  it("works once: the same link cannot be used twice", async () => {
    const c = await customerWithPassword(PW);
    const token = await signResetToken(c);
    const NEW = "Reset-Str0ng-Pass!";
    expect((await anon("/api/v1/auth/reset-password", { body: { token, password: NEW } })).status).toBe(200);
    expect((await anon("/api/v1/auth/reset-password", { body: { token, password: "Second-Str0ng-Pass!" } })).status).toBe(400);
    expect((await anon("/api/v1/auth/login", { body: { email: c.email, password: NEW } })).status).toBe(200);
    expect((await asCustomer(c.token, "/api/v1/me")).status).toBe(401); // sessions from before the reset are dead
  });
  it("rejects garbage, weak passwords and tokens meant for something else", async () => {
    const c = await customerWithPassword(PW);
    expect((await anon("/api/v1/auth/reset-password", { body: { token: "garbage", password: PW } })).status).toBe(400);
    expect((await anon("/api/v1/auth/reset-password", { body: { token: await signResetToken(c), password: "weak" } })).status).toBe(400);
    // a login session token or an email-verification token is not a reset token
    expect((await anon("/api/v1/auth/reset-password", { body: { token: await signCustomer(c.id, c.tokenVersion), password: PW } })).status).toBe(400);
    expect((await anon("/api/v1/auth/reset-password", { body: { token: await signEmailToken(c), password: PW } })).status).toBe(400);
  });
  it("forgot-password answers identically whether or not the email exists", async () => {
    const c = await customerWithPassword(PW);
    const a = await anon("/api/v1/auth/forgot-password", { body: { email: c.email } });
    const b = await anon("/api/v1/auth/forgot-password", { body: { email: `ghost-${uniq()}@example.com` } });
    expect(a.status).toBe(b.status); expect(a.json).toEqual(b.json);
  });
});

describe("email and phone verification", () => {
  it("verifies email from a signed link, bound to that address", async () => {
    const c = await customerWithPassword(PW);
    const token = await signEmailToken(c);
    await db.update(schema.customers).set({ email: `changed-${uniq()}@example.com` }).where(eq(schema.customers.id, c.id));
    expect((await anon("/api/v1/auth/verify-email", { body: { token } })).status).toBe(400); // email changed since the link was sent
    const fresh = (await db.select().from(schema.customers).where(eq(schema.customers.id, c.id)))[0];
    expect((await anon("/api/v1/auth/verify-email", { body: { token: await signEmailToken(fresh) } })).status).toBe(200);
    expect((await db.select().from(schema.customers).where(eq(schema.customers.id, c.id)))[0].emailVerified).toBe(true);
  });
  it("verifies phone with the SMS code, and refuses wrong codes or another person's token", async () => {
    const a = await customerWithPassword(PW); const b = await customerWithPassword(PW);
    const { code, token } = await newPhoneOtp(a, a.phone!);
    const wrong = code === "123456" ? "654321" : "123456";
    expect((await asCustomer(a.token, "/api/v1/auth/verify-phone", { body: { token, code: wrong } })).status).toBe(400);
    expect((await asCustomer(b.token, "/api/v1/auth/verify-phone", { body: { token, code } })).status).toBe(400);
    expect((await asCustomer(a.token, "/api/v1/auth/verify-phone", { body: { token, code } })).status).toBe(200);
    expect((await db.select().from(schema.customers).where(eq(schema.customers.id, a.id)))[0].phoneVerified).toBe(true);
  });
});
