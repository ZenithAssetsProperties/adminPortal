import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function integritySecret(): string {
  return process.env.INTEGRITY_SECRET || process.env.SESSION_SECRET || "dev-integrity-fallback-secret-32-chars";
}

/** Deterministic SHA-256 hex digest of raw file bytes. */
export function computeSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Structural anti-fake & anti-polyglot validation beyond basic magic bytes.
 * Checks minimum payload size, PDF EOF markers, JPEG EOI, and PNG IEND trailers.
 */
export function validateDocumentStructure(buf: Buffer, mime: string): { valid: boolean; reason?: string } {
  if (buf.length < 128) {
    return { valid: false, reason: "Document file is too small or empty to be authentic." };
  }

  if (mime === "application/pdf") {
    const head = buf.subarray(0, 8).toString("ascii");
    if (!head.startsWith("%PDF-")) {
      return { valid: false, reason: "Invalid PDF header." };
    }
    const tail = buf.subarray(Math.max(0, buf.length - 1024)).toString("ascii");
    if (!tail.includes("%%EOF")) {
      return { valid: false, reason: "Corrupted or truncated PDF (missing %%EOF marker)." };
    }
    return { valid: true };
  }

  if (mime === "image/jpeg") {
    if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
      return { valid: false, reason: "Invalid JPEG header." };
    }
    // Check for standard JPEG EOI marker (0xFF 0xD9) near end
    const tail = buf.subarray(Math.max(0, buf.length - 64));
    let hasEoi = false;
    for (let i = 0; i < tail.length - 1; i++) {
      if (tail[i] === 0xff && tail[i + 1] === 0xd9) {
        hasEoi = true;
        break;
      }
    }
    if (!hasEoi) {
      return { valid: false, reason: "Truncated or malformed JPEG image." };
    }
    return { valid: true };
  }

  if (mime === "image/png") {
    const iend = Buffer.from("IEND", "ascii");
    if (!buf.subarray(Math.max(0, buf.length - 32)).includes(iend)) {
      return { valid: false, reason: "Corrupted PNG image (missing IEND chunk)." };
    }
    return { valid: true };
  }

  return { valid: true };
}

export type SealPayload = {
  id: string;
  propertyId: string | null;
  sha256Hash: string;
  approvedBy: string;
  approvedAt: string;
};

/** Generates a tamper-evident HMAC-SHA256 seal when an admin approves a document. */
export function signDocumentSeal(payload: SealPayload): string {
  const canonical = `${payload.id}|${payload.propertyId ?? "none"}|${payload.sha256Hash}|${payload.approvedBy}|${payload.approvedAt}`;
  return createHmac("sha256", integritySecret()).update(canonical).digest("hex");
}

/** Constant-time verification of a document's HMAC-SHA256 approval seal. */
export function verifyDocumentSeal(payload: SealPayload, givenSeal: string | null | undefined): boolean {
  if (!givenSeal) return false;
  const expected = signDocumentSeal(payload);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(givenSeal, "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** Deterministic public verification fingerprint for a verified property listing. */
export function computePropertyVerificationHash(
  propertyId: string,
  docHashes: string[],
  verifiedBy: string,
  verifiedAtIso: string,
): string {
  const sorted = [...docHashes].sort().join(",");
  const canonical = `zenith-verify-v1|${propertyId}|${sorted}|${verifiedBy}|${verifiedAtIso}`;
  return createHmac("sha256", integritySecret()).update(canonical).digest("hex").slice(0, 32);
}
