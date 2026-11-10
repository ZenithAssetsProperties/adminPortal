import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/lib/http";
import { requireCron } from "@/lib/cron-auth";
import { expireReservations } from "@/lib/cron-jobs";

async function run(req: NextRequest) {
  try { requireCron(req); return NextResponse.json(await expireReservations()); } catch (e) { return handleError(e); }
}
export const GET = run;
export const POST = run;
