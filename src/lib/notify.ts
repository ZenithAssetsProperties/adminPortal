import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

async function log(channel: string, recipient: string, subject: string | null, body: string, status: string, error?: string) {
  await db.insert(schema.messageLog).values({ channel, recipient, subject, body, status, error }).catch((e) => console.error("message_log failed", e));
}

export async function sendEmail(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[email:dev] to=${to} subject=${subject}`); return log("email", to, subject, body, "sent", "dev-console"); }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text: body }),
    });
    await log("email", to, subject, body, res.ok ? "sent" : "failed", res.ok ? undefined : `HTTP ${res.status}`);
  } catch (e) { await log("email", to, subject, body, "failed", String(e)); }
}

export async function sendSms(to: string, body: string, channel: "sms" | "whatsapp" = "sms") {
  const key = process.env.TERMII_API_KEY;
  if (!key) { console.log(`[${channel}:dev] to=${to}`); return log(channel, to, null, body, "sent", "dev-console"); }
  try {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key, to, from: process.env.TERMII_SENDER_ID || "Zenith", sms: body,
        type: "plain", channel: channel === "whatsapp" ? "whatsapp" : "generic",
      }),
    });
    await log(channel, to, null, body, res.ok ? "sent" : "failed", res.ok ? undefined : `HTTP ${res.status}`);
  } catch (e) { await log(channel, to, null, body, "failed", String(e)); }
}

type Msg = { type: string; title: string; body: string; email?: boolean; sms?: boolean };

/** In-platform notification plus optional email/SMS. Never throws: a message failure must not undo business actions. */
export async function notifyCustomer(customerId: string, m: Msg) {
  try {
    await db.insert(schema.notifications).values({ customerId, type: m.type, title: m.title, body: m.body });
    const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId));
    if (!c) return;
    if (m.email !== false && c.email) await sendEmail(c.email, m.title, m.body);
    if (m.sms && c.phone) await sendSms(c.phone, `${m.title}: ${m.body}`);
  } catch (e) { console.error("notifyCustomer failed", e); }
}

export async function notifyStaff(staffId: string | null | undefined, m: Omit<Msg, "email" | "sms">) {
  try {
    if (staffId) { await db.insert(schema.notifications).values({ staffId, type: m.type, title: m.title, body: m.body }); return; }
    // no owner: tell every active admin
    const admins = await db.select({ id: schema.staff.id, role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.active, true));
    const targets = admins.filter((a) => a.role === "super_admin" || a.role === "admin");
    if (targets.length) await db.insert(schema.notifications).values(targets.map((a) => ({ staffId: a.id, type: m.type, title: m.title, body: m.body })));
  } catch (e) { console.error("notifyStaff failed", e); }
}
