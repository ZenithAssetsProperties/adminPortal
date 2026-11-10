import { NextRequest, NextResponse } from "next/server";
import { readLocal, verifyLocalSig } from "@/lib/storage";

// Local-disk mode only: serves a file when the signed, expiring link is valid.
// (With S3/R2 configured, links point straight at the bucket and this route is unused.)
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!key || !verifyLocalSig(key, exp, sig)) return NextResponse.json({ error: "Link expired or invalid" }, { status: 403 });
  try {
    const buf = await readLocal(key);
    const ext = key.split(".").pop();
    const type = ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
}
