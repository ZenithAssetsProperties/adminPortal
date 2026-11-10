import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-time code an existing super admin gives a new admin so they can enrol their
 * authenticator app. Without it, anyone who learned the password first could enrol
 * THEIR OWN authenticator on an account that has not set up two-step login yet.
 * Stateless: derived from the account and its current password hash, so it stops
 * working the moment the password changes or two-step login is enabled.
 */
export function setupCodeFor(staff: { id: string; passwordHash: string }): string {
  const hex = createHmac("sha256", process.env.SESSION_SECRET!).update(`2fa-setup|${staff.id}|${staff.passwordHash}`).digest("hex");
  return hex.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}

export function verifySetupCode(staff: { id: string; passwordHash: string }, given: string): boolean {
  const expected = Buffer.from(setupCodeFor(staff));
  const g = Buffer.from(given.trim().toUpperCase());
  return expected.length === g.length && timingSafeEqual(expected, g);
}
