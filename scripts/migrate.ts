import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const { db } = await import("../src/db");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
