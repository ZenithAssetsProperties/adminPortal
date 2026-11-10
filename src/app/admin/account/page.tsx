"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorNote, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

type Me = { staff: { name: string; email: string; role: Role } };

export default function AccountPage() {
  const router = useRouter();
  const { data } = useApi<Me>("/api/admin/auth/me");
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!data) return <Spinner />;
  const s = data.staff;

  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/admin/auth/change-password", { body: { current: cur, next } }); router.replace("/login"); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="My account" subtitle={`${s.name} · ${s.email} · ${ROLE_LABELS[s.role]}`} />
      <div className="max-w-xl">
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
