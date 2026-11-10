"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Building2, FileText, Users, MessageSquare, Target, CalendarCheck, Bookmark,
  Receipt, Wallet, UserCog, BarChart3, ScrollText, Shield, Menu, LogOut, KeyRound,
} from "lucide-react";
import { api } from "@/lib/client";
import { ROLE_LABELS, can, type Permission, type Role } from "@/lib/rbac";

const NAV: { href: string; label: string; icon: typeof Users; perm: Permission }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/admin/properties", label: "Properties", icon: Building2, perm: "properties.read" },
  { href: "/admin/documents", label: "Documents", icon: FileText, perm: "documents.read" },
  { href: "/admin/customers", label: "Customers", icon: Users, perm: "customers.read" },
  { href: "/admin/enquiries", label: "Enquiries", icon: MessageSquare, perm: "enquiries.read" },
  { href: "/admin/leads", label: "Leads", icon: Target, perm: "leads.read" },
  { href: "/admin/inspections", label: "Inspections", icon: CalendarCheck, perm: "inspections.read" },
  { href: "/admin/reservations", label: "Reservations", icon: Bookmark, perm: "reservations.read" },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt, perm: "transactions.read" },
  { href: "/admin/payments", label: "Payments", icon: Wallet, perm: "payments.read" },
  { href: "/admin/agents", label: "Agents", icon: UserCog, perm: "agents.read" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.read" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "audit.read" },
  { href: "/admin/staff", label: "Staff", icon: Shield, perm: "staff.manage" },
];

const IDLE_MS = 30 * 60 * 1000;

export default function AdminShell({ user, children }: { user: { name: string; email: string; role: Role }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const lastActive = useRef(Date.now());

  async function logout(expired = false) {
    await api("/api/admin/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace(expired ? "/login?expired=1" : "/login");
  }

  // Automatic session timeout: ping to keep an active session alive, sign out after 30 idle minutes.
  useEffect(() => {
    const mark = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > IDLE_MS) void logout(true);
      else void api("/api/admin/auth/me").catch(() => {});
    }, 4 * 60 * 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, mark)); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = NAV.filter((n) => can(user.role, n.perm));
  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={clsx("flex items-center gap-3 px-3 py-2 text-sm transition-colors", active ? "bg-brand-700 text-white" : "text-brand-200 hover:bg-brand-800 hover:text-white")}>
            <n.icon className="size-4 shrink-0" aria-hidden /> {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className={clsx("fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-brand-900 transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="border-b border-brand-800 px-5 py-5">
          <div className="font-heading text-2xl text-white">Zenith</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-brand-400">Back office</div>
        </div>
        {nav}
        <div className="border-t border-brand-800 p-3 text-sm">
          <div className="px-3 pb-2"><div className="truncate text-white">{user.name}</div><div className="text-xs text-brand-400">{ROLE_LABELS[user.role]}</div></div>
          <Link href="/admin/account" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-brand-200 hover:bg-brand-800"><KeyRound className="size-4" /> Account</Link>
          <button onClick={() => logout()} className="flex w-full items-center gap-3 px-3 py-2 text-brand-200 hover:bg-brand-800"><LogOut className="size-4" /> Sign out</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-brand-950/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0">
        <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-6 text-brand-800" /></button>
          <span className="font-heading text-xl text-brand-900">Zenith Back Office</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
