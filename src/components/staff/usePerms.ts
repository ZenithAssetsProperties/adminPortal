"use client";
import { useApi } from "@/lib/client";

type Me = { staff: { id: string; name: string; role: string }; permissions: string[] };

/** The signed-in staff member's permissions, so screens can hide buttons the server would refuse anyway. */
export function usePerms() {
  const { data } = useApi<Me>("/api/admin/auth/me");
  return { me: data?.staff ?? null, can: (p: string) => data?.permissions.includes(p) ?? false };
}
