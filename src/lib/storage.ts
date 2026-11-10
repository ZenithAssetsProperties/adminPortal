import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const useS3 = () => Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID);
const LOCAL_DIR = path.join(process.cwd(), ".uploads");

let client: S3Client | undefined;
function s3() {
  client ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}

/** Detect the real file type from its first bytes (never trust the browser's claim). */
export function sniffType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.subarray(0, 5).toString() === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function newKey(folder: string, ext: string) {
  return `${folder}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
}

function assertSafeKey(key: string) {
  if (key.includes("..") || key.startsWith("/") || !/^[a-zA-Z0-9/_.-]+$/.test(key)) throw new Error("Invalid storage key");
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  assertSafeKey(key);
  if (useS3()) {
    await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const file = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export async function deleteObject(key: string) {
  assertSafeKey(key);
  if (useS3()) {
    await s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
  } else {
    await fs.rm(path.join(LOCAL_DIR, key), { force: true });
  }
}

export async function readLocal(key: string) {
  assertSafeKey(key);
  return fs.readFile(path.join(LOCAL_DIR, key));
}

function sig(key: string, exp: number) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(`${key}|${exp}`).digest("hex");
}
export function verifyLocalSig(key: string, exp: number, given: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const a = Buffer.from(sig(key, exp)); const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Short-lived download link. `baseUrl` is this app's origin (used in local-disk mode). */
export async function signedUrl(key: string, baseUrl: string, filename?: string, seconds = 300): Promise<string> {
  assertSafeKey(key);
  if (useS3()) {
    return getSignedUrl(s3(), new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!, Key: key,
      ResponseContentDisposition: filename ? `inline; filename="${filename.replace(/[^\w.\- ]/g, "_")}"` : undefined,
    }), { expiresIn: seconds });
  }
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return `${baseUrl}/api/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig(key, exp)}`;
}
