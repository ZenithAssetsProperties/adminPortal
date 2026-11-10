import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

export const newTotpSecret = () => generateSecret();

export async function totpSetup(email: string, secret: string) {
  const uri = generateURI({ issuer: "Zenith Back Office", label: email, secret });
  return { uri, qrDataUrl: await QRCode.toDataURL(uri) };
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    // allow one 30s step either side for clock drift
    return verifySync({ secret, token, epochTolerance: 30 }).valid === true;
  } catch {
    return false;
  }
}
