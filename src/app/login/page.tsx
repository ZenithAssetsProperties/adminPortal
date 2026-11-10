"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const expired = useSearchParams().get("expired");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/admin/auth/login", { body: { email, password } }); router.replace("/admin"); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

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
          <h2 className="mb-1 text-4xl text-brand-900">Sign in</h2>
          <p className="mb-6 text-sm text-brand-500">Use your staff email and password.</p>
          {expired && <p className="mb-4 text-sm text-brand-600">You were signed out for inactivity. Please sign in again.</p>}
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Email"><Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
