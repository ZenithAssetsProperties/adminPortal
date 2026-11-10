import { config } from "dotenv";
config({ path: ".env.local" });
config();
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function main() {
  const { db, schema } = await import("../src/db");
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  const [existing] = await db.select().from(schema.staff).where(eq(schema.staff.email, email));
  if (existing) { console.log("Super admin already exists:", email); process.exit(0); }
  const [row] = await db.insert(schema.staff).values({
    name: "Super Admin", email, role: "super_admin", passwordHash: await bcrypt.hash(password, 12),
  }).returning();
  const { setupCodeFor } = await import("../src/lib/auth/setup-code");
  console.log("Created super admin:", email);
  console.log("Two-step setup code (needed at first sign-in):", setupCodeFor(row));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
