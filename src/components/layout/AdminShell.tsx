"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Users,
  MessageSquare,
  Target,
  CalendarCheck,
  Bookmark,
  Receipt,
  Wallet,
  UserCog,
  BarChart3,
  ScrollText,
  Shield,
  ShieldCheck,
  BadgeCheck,
  Menu,
  LogOut,
  KeyRound,
  Search,
  Lock,
} from "lucide-react";
import { ZenithLogo } from "@/components/ZenithLogo";
import { Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { ROLE_LABELS, can, type Permission, type Role } from "@/lib/rbac";

type NavItem = { href: string; label: string; icon: typeof Users; perm: Permission };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Command",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.read" },
    ],
  },
  {
    title: "Listings & Trust",
    items: [
      { href: "/admin/verification", label: "Verification Queue", icon: BadgeCheck, perm: "properties.write" },
      { href: "/admin/properties", label: "Properties", icon: Building2, perm: "properties.read" },
      { href: "/admin/documents", label: "Document Vault", icon: FileText, perm: "documents.read" },
    ],
  },
  {
    title: "Sales & CRM",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, perm: "customers.read" },
      { href: "/admin/enquiries", label: "Enquiries", icon: MessageSquare, perm: "enquiries.read" },
      { href: "/admin/leads", label: "Leads", icon: Target, perm: "leads.read" },
      { href: "/admin/inspections", label: "Inspections", icon: CalendarCheck, perm: "inspections.read" },
      { href: "/admin/agents", label: "Agents", icon: UserCog, perm: "agents.read" },
    ],
  },
  {
    title: "Treasury & Deals",
    items: [
      { href: "/admin/reservations", label: "Reservations", icon: Bookmark, perm: "reservations.read" },
      { href: "/admin/transactions", label: "Transactions", icon: Receipt, perm: "transactions.read" },
      { href: "/admin/payments", label: "Payments", icon: Wallet, perm: "payments.read" },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/admin/privacy", label: "Privacy & RBAC", icon: ShieldCheck, perm: "privacy.read" },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText, perm: "audit.read" },
      { href: "/admin/staff", label: "Staff & Roles", icon: Shield, perm: "staff.manage" },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
const IDLE_MS = 30 * 60 * 1000;

export default function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const lastActive = useRef(Date.now());

  async function logout(expired = false) {
    await api("/api/admin/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace(expired ? "/login?expired=1" : "/login");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const mark = () => {
      lastActive.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > IDLE_MS) void logout(true);
      else void api("/api/admin/auth/me").catch(() => {});
    }, 4 * 60 * 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => can(user.role, n.perm)),
  })).filter((g) => g.items.length > 0);

  const visibleFlat = ALL_NAV.filter(
    (n) => can(user.role, n.perm) && n.label.toLowerCase().includes(cmdQuery.toLowerCase()),
  );

  const currentLabel =
    ALL_NAV.find((n) => (n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)))?.label ??
    "Back Office";

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {visibleGroups.map((group) => (
        <div key={group.title}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-brand-400">
            {group.title}
          </div>
          <div className="space-y-0.5">
            {group.items.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand-700 font-medium text-white shadow-xs"
                      : "text-brand-200 hover:bg-brand-800/80 hover:text-white",
                  )}
                >
                  <n.icon className="size-4 shrink-0" aria-hidden />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[256px_1fr]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-brand-900 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-brand-800 px-5 py-5">
          <ZenithLogo size="md" subtitle="Enterprise Back Office" />
        </div>
        {nav}
        <div className="border-t border-brand-800 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2.5 rounded-sm bg-brand-800/60 px-3 py-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{user.name}</div>
              <div className="text-[11px] text-brand-300">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <Link
            href="/admin/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-sm px-3 py-1.5 text-brand-200 hover:bg-brand-800 hover:text-white"
          >
            <KeyRound className="size-4" /> Account &amp; Security
          </Link>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-1.5 text-brand-200 hover:bg-brand-800 hover:text-white"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-20 bg-brand-950/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-col">
        {/* Top Command Bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white/95 px-4 py-3 backdrop-blur-xs sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="lg:hidden">
              <Menu className="size-6 text-brand-800" />
            </button>
            <div className="lg:hidden">
              <ZenithLogo size="sm" theme="light" subtitle="Back office" />
            </div>
            <div className="hidden items-center gap-2 text-sm lg:flex">
              <span className="text-muted-foreground">Zenith Portal</span>
              <span className="text-border">/</span>
              <span className="font-medium text-foreground">{currentLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCmdQuery("");
                setCmdOpen(true);
              }}
              className="flex items-center gap-2 rounded-sm border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand-300 hover:text-foreground"
            >
              <Search className="size-3.5" />
              <span className="hidden sm:inline">Quick Jump</span>
              <kbd className="hidden rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shadow-2xs sm:inline">
                ⌘K
              </kbd>
            </button>
            <span className="hidden items-center gap-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 sm:inline-flex">
              <Lock className="size-3" /> Cryptographic Trust Active
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Quick Jump Command Palette */}
      <Modal open={cmdOpen} onClose={() => setCmdOpen(false)} title="Quick Navigation">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              autoFocus
              value={cmdQuery}
              onChange={(e) => setCmdQuery(e.target.value)}
              placeholder="Jump to Verification, Privacy, Properties, Customers..."
              className="w-full rounded-sm border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {visibleFlat.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">No matching screens.</p>
            ) : (
              visibleFlat.map((n) => (
                <button
                  key={n.href}
                  onClick={() => {
                    setCmdOpen(false);
                    router.push(n.href);
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-brand-50/60"
                >
                  <n.icon className="size-4 text-brand-700" />
                  <span className="font-medium text-foreground">{n.label}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{n.href}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
