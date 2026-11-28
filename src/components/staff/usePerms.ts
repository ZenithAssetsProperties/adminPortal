"use client";
import { useApi } from "@/lib/client";
import type { PiiAccessLevel } from "@/lib/rbac";

type Me = {
  staff: { id: string; name: string; role: string; piiAccessLevel?: PiiAccessLevel };
  permissions: string[];
  piiAccessLevel?: PiiAccessLevel;
};

/** The signed-in staff member's permissions and privacy tier, so screens can enforce least-privilege UI. */
export function usePerms() {
  const { data } = useApi<Me>("/api/admin/auth/me");
  return {
    me: data?.staff ?? null,
    permissions: data?.permissions ?? [],
    piiAccessLevel: data?.piiAccessLevel ?? data?.staff?.piiAccessLevel ?? "masked",
    can: (p: string) => data?.permissions.includes(p) ?? false,
  };
}
