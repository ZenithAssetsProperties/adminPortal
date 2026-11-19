"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { ZenithLogo } from "@/components/ZenithLogo";
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
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-12 text-white lg:flex relative overflow-hidden">
        {/* Subtle decorative background aura */}
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-gold-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <ZenithLogo size="lg" subtitle="Asset Group · Executive Office" />
        </div>
        <div className="relative z-10 max-w-lg">
          <div className="inline-block border border-gold-400/30 bg-gold-400/10 px-3 py-1 text-xs uppercase tracking-widest text-gold-300 mb-6">
            Enterprise Portal
          </div>
          <h1 className="text-5xl leading-tight font-heading font-normal">
            Every property tells its story.
          </h1>
          <p className="mt-4 text-brand-200 text-base leading-relaxed">
            Centralized back office for Zenith portfolio management. Orchestrate properties, investor documentation, verified transactions, and customer relationships.
          </p>
        </div>
        <div className="relative z-10 flex items-center justify-between text-xs text-brand-400 border-t border-brand-800/80 pt-4">
          <span>Authorized staff only · High security gateway</span>
          <span>v1.0.0</span>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 bg-paper">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden mb-8">
            <ZenithLogo size="md" theme="light" subtitle="Staff Back Office" />
          </div>
          <h2 className="mb-1 text-3xl font-heading text-brand-900">Sign in</h2>
          <p className="mb-6 text-sm text-brand-500">Access your Zenith staff account.</p>
          {expired && (
            <p className="mb-4 text-sm text-brand-600 bg-brand-50 border border-brand-200 p-2">
              You were signed out for inactivity. Please sign in again.
            </p>
          )}
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                required
                autoFocus
                placeholder="admin@zenithassets.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full shadow-sm hover:shadow">
              Sign in to Portal
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
