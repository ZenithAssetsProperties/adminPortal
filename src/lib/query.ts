import { z } from "zod";

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});

export const offset = (p: { page: number; pageSize: number }) => (p.page - 1) * p.pageSize;
export const paged = <T>(items: T[], total: number, p: { page: number; pageSize: number }) => ({ items, total, page: p.page, pageSize: p.pageSize });

/** Escape % and _ so user text is matched literally inside ILIKE. */
export const likeEscape = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
