"use client";
import { useCallback, useEffect, useState } from "react";

export class ApiFail extends Error { constructor(public status: number, message: string, public details?: unknown) { super(message); } }

/** fetch wrapper for the admin API. Sends the user to the login page when the session has ended. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
    body: init.body === undefined ? undefined : init.body instanceof FormData ? init.body : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.includes("/auth/")) { window.location.href = "/login?expired=1"; throw new ApiFail(401, "Session ended"); }
  if (!res.ok) {
    const detail = Array.isArray(json.details) ? json.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join("; ") : "";
    throw new ApiFail(res.status, [json.error ?? "Request failed", detail].filter(Boolean).join(" — "), json.details);
  }
  return json as T;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export const naira = (kobo: number | null | undefined) =>
  kobo == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d)) : "—";
export const fmtDay = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(d)) : "—";
