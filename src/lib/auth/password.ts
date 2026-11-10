import bcrypt from "bcryptjs";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (pw.length > 128) return "Password is too long";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Password must include upper case, lower case and a number";
  }
  return null;
}

// Compared against when the email is unknown, so login takes the same time either way.
let dummy: string | undefined;
export const dummyHash = () => (dummy ??= bcrypt.hashSync("zenith-timing-guard", 12));
