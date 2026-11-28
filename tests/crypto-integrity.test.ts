import { describe, expect, it } from "vitest";
import {
  computePropertyVerificationHash,
  computeSha256,
  signDocumentSeal,
  validateDocumentStructure,
  verifyDocumentSeal,
} from "@/lib/crypto-integrity";

describe("Cryptographic Document Integrity Engine", () => {
  it("computes deterministic SHA-256 digests", () => {
    const buf = Buffer.from("%PDF-1.7\n" + "a".repeat(200) + "\n%%EOF");
    const h1 = computeSha256(buf);
    const h2 = computeSha256(buf);
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });

  it("validates authentic PDF structure and rejects truncated/corrupt PDFs", () => {
    const validPdf = Buffer.from("%PDF-1.7\n" + "x".repeat(200) + "\n%%EOF");
    expect(validateDocumentStructure(validPdf, "application/pdf").valid).toBe(true);

    const truncatedPdf = Buffer.from("%PDF-1.7\n" + "x".repeat(200));
    expect(validateDocumentStructure(truncatedPdf, "application/pdf").valid).toBe(false);

    const tinyBuf = Buffer.from("%PDF-1.7%%EOF");
    expect(validateDocumentStructure(tinyBuf, "application/pdf").valid).toBe(false);
  });

  it("validates JPEG EOI and PNG IEND markers", () => {
    const validJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(150, 1), Buffer.from([0xff, 0xd9])]);
    expect(validateDocumentStructure(validJpg, "image/jpeg").valid).toBe(true);

    const brokenJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(150, 1)]);
    expect(validateDocumentStructure(brokenJpg, "image/jpeg").valid).toBe(false);

    const validPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(150, 2),
      Buffer.from("IEND", "ascii"),
    ]);
    expect(validateDocumentStructure(validPng, "image/png").valid).toBe(true);
  });

  it("signs and verifies tamper-evident HMAC-SHA256 document seals", () => {
    const payload = {
      id: "doc-123",
      propertyId: "prop-456",
      sha256Hash: "a".repeat(64),
      approvedBy: "staff-789",
      approvedAt: "2026-11-28T05:00:00.000Z",
    };

    const seal = signDocumentSeal(payload);
    expect(verifyDocumentSeal(payload, seal)).toBe(true);

    // Tampering with hash or propertyId invalidates the seal
    expect(verifyDocumentSeal({ ...payload, sha256Hash: "b".repeat(64) }, seal)).toBe(false);
    expect(verifyDocumentSeal({ ...payload, propertyId: "prop-999" }, seal)).toBe(false);
    expect(verifyDocumentSeal(payload, "deadbeef")).toBe(false);
  });

  it("computes deterministic order-independent property verification hashes", () => {
    const h1 = computePropertyVerificationHash("p1", ["hashB", "hashA"], "admin1", "2026-11-28T05:00:00Z");
    const h2 = computePropertyVerificationHash("p1", ["hashA", "hashB"], "admin1", "2026-11-28T05:00:00Z");
    expect(h1).toHaveLength(32);
    expect(h1).toBe(h2);
  });
});
