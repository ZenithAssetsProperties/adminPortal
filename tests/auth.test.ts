import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BASE, asStaff, uniq } from "./helpers";

const PASSWORD = "Correct-Horse-9";
let ipCounter = 0;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${++ipCounter % 250}`;

async function newStaff(role: "admin" | "sales_agent" | "finance" = "admin") {
  const [s] = await db.insert(schema.staff).values({
    name: "Auth Test", email: `auth-${uniq()}@zenith.test`, role, passwordHash: await bcrypt.hash(PASSWORD, 4),
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

describe("staff sign-in (email and password only)", () => {
  it("signs every role straight in with the right password", async () => {
    for (const role of ["admin", "finance", "sales_agent"] as const) {
      const s = await newStaff(role);
      const l = await login(s.email, PASSWORD);
      expect(l.status).toBe(200);
      expect((await asStaff(l.cookie, "/api/admin/auth/me")).json.staff.email).toBe(s.email);
    }
  });

  it("refuses a wrong password and never sets a session", async () => {
    const s = await newStaff();
    const l = await login(s.email, "wrong-password-1");
    expect(l.status).toBe(401);
    expect(l.cookie).toBe("");
  });

  it("refuses a deactivated account", async () => {
    const s = await newStaff();
    await db.update(schema.staff).set({ active: false }).where(eq(schema.staff.id, s.id));
    expect((await login(s.email, PASSWORD)).status).toBe(401);
  });

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
    expect(results.map((r) => r.status)).toContain(429);
  });

  it("changing the password signs out other sessions", async () => {
    const s = await newStaff();
    const a = await login(s.email, PASSWORD);
    const r = await asStaff(a.cookie, "/api/admin/auth/change-password", { body: { current: PASSWORD, next: "Brand-New-Pass-77" } });
    expect(r.status).toBe(200);
    expect((await asStaff(a.cookie, "/api/admin/auth/me")).status).toBe(401);
    expect((await login(s.email, "Brand-New-Pass-77")).status).toBe(200);
  });
});
