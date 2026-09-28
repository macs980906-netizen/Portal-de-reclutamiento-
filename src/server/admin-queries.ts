import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { AGENCY_IDS } from "@/config/agencies";
import { STATUS_IDS } from "@/config/statuses";
import { INTERVIEW_AVAILABILITY_OPTIONS, ids } from "@/lib/form-options";
import { normalizeMxPhone } from "@/lib/validation";

export const PAGE_SIZE = 25;

const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

export const filtersSchema = z.object({
  q: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  agency: z.preprocess(emptyToUndef, z.enum(AGENCY_IDS).optional()),
  status: z.preprocess(emptyToUndef, z.enum(STATUS_IDS).optional()),
  availability: z.preprocess(emptyToUndef, z.enum(ids(INTERVIEW_AVAILABILITY_OPTIONS)).optional()),
  from: z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  to: z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  cycle: z.preprocess(emptyToUndef, z.string().cuid().optional()),
  duplicates: z.preprocess(emptyToUndef, z.enum(["hide", "only"]).optional()),
  sort: z.preprocess(emptyToUndef, z.enum(["recommended", "date", "score", "agency", "status"]).default("date")),
  dir: z.preprocess(emptyToUndef, z.enum(["asc", "desc"]).default("desc")),
  page: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(10_000).default(1)),
});

export type Filters = z.infer<typeof filtersSchema>;

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const r = filtersSchema.safeParse(flat);
  return r.success ? r.data : filtersSchema.parse({});
}

export function buildWhere(f: Filters): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  if (f.q) {
    const q = f.q;
    const or: Prisma.ApplicationWhereInput[] = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q.toLowerCase() } },
      { code: q.toUpperCase() },
    ];
    const parts = q.split(/\s+/);
    if (parts.length >= 2) {
      or.push({
        AND: [
          { firstName: { contains: parts[0]!, mode: "insensitive" } },
          { lastName: { contains: parts.slice(1).join(" "), mode: "insensitive" } },
        ],
      });
    }
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) or.push({ phone: { contains: normalizeMxPhone(digits) ?? digits } });
    and.push({ OR: or });
  }
  if (f.agency) and.push({ OR: [{ agencyFirst: f.agency }, { agencySecond: f.agency }] });
  if (f.status) and.push({ status: f.status });
  if (f.availability) and.push({ interviewAvailability: { has: f.availability } });
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00-06:00`) } });
  if (f.to) and.push({ createdAt: { lte: new Date(`${f.to}T23:59:59.999-06:00`) } });
  if (f.cycle) and.push({ cycleId: f.cycle });
  if (f.duplicates === "hide") and.push({ possibleDuplicate: false });
  if (f.duplicates === "only") and.push({ possibleDuplicate: true });
  return and.length ? { AND: and } : {};
}

export function buildOrder(f: Filters): Prisma.ApplicationOrderByWithRelationInput[] {
  const dir = f.dir;
  switch (f.sort) {
    case "recommended":
      // Sin desempate por orden de llegada: a igual puntaje se ordena por código aleatorio.
      return [{ priority: "desc" }, { scoreTotal: { sort: "desc", nulls: "last" } }, { code: "asc" }];
    case "score":
      return [{ scoreTotal: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
    case "agency":
      return [{ agencyFirst: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
    case "status":
      return [{ status: dir }, { createdAt: "desc" }];
    default:
      return [{ createdAt: dir }];
  }
}

export function filtersToQuery(f: Partial<Filters>, overrides: Partial<Record<keyof Filters, string | number | undefined>> = {}) {
  const params = new URLSearchParams();
  const merged = { ...f, ...overrides } as Record<string, unknown>;
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "page" && Number(v) === 1) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
