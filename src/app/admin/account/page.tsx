"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

type Me = { staff: { name: string; email: string; role: Role; totpEnabled: boolean } };

export default function AccountPage() {
  const router = useRouter();
  const { data, reload } = useApi<Me>("/api/admin/auth/me");
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null); const [code, setCode] = useState(""); const [tfaErr, setTfaErr] = useState<string | null>(null);
  if (!data) return <Spinner />;
  const s = data.staff;

  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/admin/auth/change-password", { body: { current: cur, next } }); router.replace("/login"); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  async function startTfa() { setTfaErr(null); try { setQr(await api("/api/admin/auth/2fa")); } catch (e) { setTfaErr((e as Error).message); } }
  async function confirmTfa(e: React.FormEvent) {
    e.preventDefault(); setTfaErr(null);
    try { await api("/api/admin/auth/2fa", { body: { code } }); setQr(null); setCode(""); await reload(); } catch (e2) { setTfaErr((e2 as Error).message); }
  }

  return (
    <>
      <PageHeader title="My account" subtitle={`${s.name} · ${s.email} · ${ROLE_LABELS[s.role]}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Two-step sign-in" actions={<Badge tone={s.totpEnabled ? "green" : "amber"}>{s.totpEnabled ? "On" : "Off"}</Badge>}>
          {s.totpEnabled ? <p className="text-sm text-brand-600">Your account asks for a 6-digit code at every sign-in. To change your authenticator, ask a super admin to reset it.</p> : !qr ? (
            <div className="space-y-3"><p className="text-sm text-brand-600">Add a second step with an authenticator app. {s.role === "admin" || s.role === "super_admin" ? "It is required for your role." : "It is optional for your role, but recommended."}</p>
              <Button onClick={startTfa}>Set up two-step</Button></div>
          ) : (
            <form onSubmit={confirmTfa} className="space-y-3">
              <div className="flex flex-col items-center gap-2 border border-line p-3">{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={qr.qrDataUrl} alt="Authenticator QR code" className="size-40" /><code className="break-all text-xs text-brand-500">{qr.secret}</code></div>
              <Field label="6-digit code"><Input inputMode="numeric" maxLength={6} pattern="\d{6}" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
              <Button type="submit">Turn on</Button>
            </form>
          )}
          <div className="mt-3"><ErrorNote message={tfaErr} /></div>
        </Card>
        <Card title="Change password">
          <form onSubmit={changePw} className="space-y-4">
            <Field label="Current password"><Input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
            <Field label="New password" hint="12+ characters with upper case, lower case and a number. You will be signed out everywhere."><Input type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
            <ErrorNote message={err} /><Button type="submit" loading={busy}>Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
