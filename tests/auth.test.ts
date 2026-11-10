import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { generateSecret, generateSync } from "otplib";
import { db, schema } from "@/db";
import { setupCodeFor } from "@/lib/auth/setup-code";
import { BASE, asStaff, makeStaff, uniq } from "./helpers";

const PASSWORD = "Correct-Horse-9";
let ipCounter = 0;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${++ipCounter % 250}`;

async function newStaff(role: "admin" | "sales_agent" = "admin", totp?: string) {
  const [s] = await db.insert(schema.staff).values({
    name: "Auth Test", email: `auth-${uniq()}@zenith.test`, role, passwordHash: await bcrypt.hash(PASSWORD, 4),
    totpEnabled: Boolean(totp), totpSecret: totp ?? null,
  }).returning();
  return s;
}
async function login(email: string, password: string, forwarded = ip()) {
  const res = await fetch(`${BASE}/api/admin/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": forwarded }, body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json: await res.json(), cookie };
}

describe("staff sign-in", () => {
  it("gives the same answer for unknown email, wrong password and locked account", async () => {
    const s = await newStaff();
    const unknown = await login(`nobody-${uniq()}@zenith.test`, "whatever-123");
    const wrong = await login(s.email, "wrong-password-1");
    for (let i = 0; i < 5; i++) await login(s.email, "wrong-password-1");
    const lockedRight = await login(s.email, PASSWORD); // correct password but account is now locked
    expect([unknown.status, wrong.status, lockedRight.status]).toEqual([401, 401, 401]);
    expect(wrong.json.error).toBe(unknown.json.error);
    expect(lockedRight.json.error).toBe(unknown.json.error);
    expect(lockedRight.cookie).toBe("");
    // once the lock passes, the right password works again
    await db.update(schema.staff).set({ lockedUntil: new Date(Date.now() - 1000), failedLogins: 0 }).where(eq(schema.staff.id, s.id));
    expect((await login(s.email, PASSWORD)).status).toBe(200);
  });

  it("cannot dodge the rate limit by faking X-Forwarded-For", { timeout: 120_000 }, async () => {
    const real = ip();
    // attacker rotates the left-most (forgeable) entry; our proxy's entry stays the same
    const results = await Promise.all(Array.from({ length: 26 }, (_, i) =>
      login(`spoof-${uniq()}@zenith.test`, "x-wrong-pass-1", `203.0.113.${i}, ${real}`)));
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain(429);
  });
});

describe("two-step setup", () => {
  it("is refused with only the password; allowed with the issued setup code", async () => {
    const s = await newStaff("admin");
    const l = await login(s.email, PASSWORD);
    expect(l.json.next).toBe("setup");
    const get = (h: Record<string, string>) => fetch(`${BASE}/api/admin/auth/2fa`, { headers: { Cookie: l.cookie, ...h } });
    expect((await get({})).status).toBe(403);
    expect((await get({ "x-setup-code": "AAAA-BBBB-CCCC" })).status).toBe(403);
    const code = setupCodeFor(s);
    const ok = await get({ "x-setup-code": code });
    expect(ok.status).toBe(200);
    const { secret } = await ok.json();
    // confirming also needs the code, even with a valid authenticator number
    const totp = generateSync({ secret });
    const noCode = await fetch(`${BASE}/api/admin/auth/2fa`, { method: "POST", headers: { Cookie: l.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ code: totp }) });
    expect(noCode.status).toBe(403);
    const done = await fetch(`${BASE}/api/admin/auth/2fa`, { method: "POST", headers: { Cookie: l.cookie, "Content-Type": "application/json", "x-setup-code": code }, body: JSON.stringify({ code: totp }) });
    expect(done.status).toBe(200);
    const sess = (done.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
    expect((await asStaff(sess, "/api/admin/auth/me")).status).toBe(200);
  });

  it("only a super admin can fetch a setup code, and it dies once 2FA is on", async () => {
    const target = await newStaff("admin");
    const sup = await makeStaff("super_admin"); const adm = await makeStaff("admin");
    expect((await asStaff(adm.cookie, `/api/admin/auth/setup-code?staffId=${target.id}`)).status).toBe(403);
    const r = await asStaff(sup.cookie, `/api/admin/auth/setup-code?staffId=${target.id}`);
    expect(r.status).toBe(200);
    expect(r.json.code).toBe(setupCodeFor(target));
    await db.update(schema.staff).set({ totpEnabled: true }).where(eq(schema.staff.id, target.id));
    expect((await asStaff(sup.cookie, `/api/admin/auth/setup-code?staffId=${target.id}`)).status).toBe(409);
  });

  it("requires the authenticator code after the password when 2FA is on", async () => {
    const secret = generateSecret();
    const s = await newStaff("admin", secret);
    const l = await login(s.email, PASSWORD);
    expect(l.json.next).toBe("verify");
    expect((await asStaff(l.cookie, "/api/admin/auth/me")).status).toBe(401); // password alone is not a session
    const bad = await fetch(`${BASE}/api/admin/auth/verify-2fa`, { method: "POST", headers: { Cookie: l.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ code: "000000" }) });
    expect(bad.status).toBe(401);
    const good = await fetch(`${BASE}/api/admin/auth/verify-2fa`, { method: "POST", headers: { Cookie: l.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ code: generateSync({ secret }) }) });
    expect(good.status).toBe(200);
  });
});
