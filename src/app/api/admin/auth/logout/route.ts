import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STAFF_COOKIE } from "@/lib/auth/session";
import { currentStaff } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function POST() {
  const s = await currentStaff();
  const jar = await cookies();
  jar.delete(STAFF_COOKIE);
  if (s) await audit({ type: "staff", id: s.staff.id }, "staff.logout");
  return NextResponse.json({ ok: true });
}
