"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

type Step = "password" | "verify" | "setup";

function LoginForm() {
  const router = useRouter();
  const expired = useSearchParams().get("expired");
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step === "setup") api<{ qrDataUrl: string; secret: string }>("/api/admin/auth/2fa").then(setQr).catch((e) => setError(e.message));
  }, [step]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const submitPassword = () => run(async () => {
    const r = await api<{ next: "verify" | "setup" | "done" }>("/api/admin/auth/login", { body: { email, password } });
    if (r.next === "done") router.replace("/admin"); else setStep(r.next);
  });
  const submitCode = () => run(async () => {
    await api(step === "setup" ? "/api/admin/auth/2fa" : "/api/admin/auth/verify-2fa", { body: { code } });
    router.replace("/admin");
  });

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <div className="text-sm uppercase tracking-[0.25em] text-brand-300">Zenith Asset Group</div>
        <div>
          <h1 className="text-6xl leading-tight">Every property tells its story.</h1>
          <p className="mt-4 max-w-md text-brand-200">Staff back office. Manage listings, enquiries, inspections, payments and documents in one place.</p>
        </div>
        <div className="text-xs text-brand-400">Authorised staff only. Activity is logged.</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-up">
          <h2 className="mb-1 text-4xl text-brand-900">{step === "password" ? "Sign in" : step === "verify" ? "Two-step check" : "Secure your account"}</h2>
          <p className="mb-6 text-sm text-brand-500">
            {step === "password" && "Use your staff email and password."}
            {step === "verify" && "Enter the 6-digit code from your authenticator app."}
            {step === "setup" && "Admins must use two-step login. Scan this code with an authenticator app, then enter the 6-digit code it shows."}
          </p>
          {expired && step === "password" && <p className="mb-4 text-sm text-brand-600">You were signed out for inactivity. Please sign in again.</p>}
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void (step === "password" ? submitPassword() : submitCode()); }}>
            {step === "password" ? (
              <>
                <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              </>
            ) : (
              <>
                {step === "setup" && qr && (
                  <div className="flex flex-col items-center gap-2 border border-line bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr.qrDataUrl} alt="Authenticator QR code" className="size-44" />
                    <code className="break-all text-xs text-brand-500">{qr.secret}</code>
                  </div>
                )}
                <Field label="6-digit code">
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required autoFocus value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center text-xl tracking-[0.5em]" />
                </Field>
              </>
            )}
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full">{step === "password" ? "Continue" : "Verify and sign in"}</Button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
