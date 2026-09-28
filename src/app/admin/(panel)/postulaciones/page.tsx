import Link from "next/link";
import { AGENCIES, agencyName } from "@/config/agencies";
import { STATUSES, statusLabel } from "@/config/statuses";
import { INTERVIEW_AVAILABILITY_OPTIONS } from "@/lib/form-options";
import { SCORE_DISCLAIMER } from "@/lib/dimensions";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PAGE_SIZE, buildOrder, buildWhere, filtersToQuery, parseFilters, type Filters } from "@/server/admin-queries";
import { StatusBadge } from "../ui";
import { EVAL_STATUS } from "@/server/evaluation/service";

const SORTS: { id: Filters["sort"]; label: string }[] = [
  { id: "date", label: "Fecha" },
  { id: "recommended", label: "Recomendado (prioridad + puntaje)" },
  { id: "score", label: "Puntaje orientativo" },
  { id: "agency", label: "Agencia" },
  { id: "status", label: "Estado" },
];

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

function maskPhone(p: string) {
  return p.length >= 4 ? `•• •••• ${p.slice(-4)}` : "••••";
}

export default async function ApplicationsList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("applications:view");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const where = buildWhere(filters);

  const [count, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: buildOrder(filters),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        phone: true,
        agencyFirst: true,
        agencySecond: true,
        anyAgency: true,
        scoreTotal: true,
        afterClose: true,
        cycle: { select: { name: true } },
        evaluations: { select: { status: true, rubricVersion: true } },
        rubricVersion: true,
        humanRating: true,
        status: true,
        priority: true,
        possibleDuplicate: true,
        createdAt: true,
        cv: { select: { id: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilters = Boolean(filters.q || filters.agency || filters.status || filters.availability || filters.from || filters.to || filters.duplicates);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Postulaciones</h1>
          <p className="text-sm text-zinc-600">{SCORE_DISCLAIMER}</p>
        </div>
        {can(user.role, "export:csv") && (
          <a href={`/admin/export${filtersToQuery(filters, { page: undefined })}`} className="a-btn a-btn-light" download>
            Exportar CSV ({count})
          </a>
        )}
      </div>

      {sp.deleted === "1" && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
          Expediente eliminado definitivamente (datos, respuestas y CV).
        </p>
      )}

      <form method="get" className="a-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filtrar postulaciones">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="text-sm font-semibold">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Nombre, correo, teléfono o código RMX-…" className="a-input mt-1" />
        </div>
        <Select id="agency" label="Agencia" value={filters.agency} options={AGENCIES.map((a) => ({ id: a.id, label: a.name }))} />
        <Select id="status" label="Estado" value={filters.status} options={STATUSES.map((s) => ({ id: s.id, label: s.label }))} />
        <Select id="availability" label="Disponibilidad para entrevista" value={filters.availability} options={INTERVIEW_AVAILABILITY_OPTIONS} />
        <div>
          <label htmlFor="from" className="text-sm font-semibold">
            Desde
          </label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className="a-input mt-1" />
        </div>
        <div>
          <label htmlFor="to" className="text-sm font-semibold">
            Hasta
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className="a-input mt-1" />
        </div>
        <Select
          id="duplicates"
          label="Duplicados"
          value={filters.duplicates}
          options={[
            { id: "hide", label: "Ocultar posibles duplicados" },
            { id: "only", label: "Sólo posibles duplicados" },
          ]}
          placeholder="Mostrar todos"
        />
        <Select id="sort" label="Ordenar por" value={filters.sort} options={SORTS} placeholder={null} />
        <Select
          id="dir"
          label="Dirección"
          value={filters.dir}
          options={[
            { id: "desc", label: "Descendente" },
            { id: "asc", label: "Ascendente" },
          ]}
          placeholder={null}
        />
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="submit" className="a-btn">
            Aplicar
          </button>
          {hasFilters && (
            <Link href="/admin/postulaciones" className="a-btn a-btn-light">
              Limpiar
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-zinc-600" aria-live="polite">
        {count} {count === 1 ? "resultado" : "resultados"}
        {pages > 1 ? ` · Página ${filters.page} de ${pages}` : ""}
      </p>

      {rows.length === 0 ? (
        <div className="a-card p-10 text-center text-zinc-600">
          {hasFilters ? "No hay postulaciones con estos filtros." : "Aún no hay postulaciones."}
        </div>
      ) : (
        <div className="a-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Postulaciones</caption>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th scope="col" className="px-4 py-3">Persona</th>
                <th scope="col" className="px-4 py-3">Agencias</th>
                <th scope="col" className="px-4 py-3 text-right">Puntaje orientativo</th>
                <th scope="col" className="px-4 py-3 text-center">Calif. humana</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">Recibida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/postulaciones/${r.id}`} className="font-semibold text-zinc-900 underline-offset-2 hover:underline">
                      {r.firstName} {r.lastName}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="font-mono">{r.code}</span>
                      <span>{maskPhone(r.phone)}</span>
                      {r.cv && <span className="rounded bg-zinc-100 px-1.5">CV</span>}
                      {r.priority > 0 && <span className="rounded bg-red-100 px-1.5 font-semibold text-red-800">Prioridad alta</span>}
                      {r.priority < 0 && <span className="rounded bg-zinc-100 px-1.5">Prioridad baja</span>}
                      {r.possibleDuplicate && <span className="rounded bg-amber-100 px-1.5 text-amber-900">Posible duplicado</span>}
                      {r.afterClose && <span className="rounded bg-amber-100 px-1.5 text-amber-900">Posterior al cierre</span>}
                      {r.cycle && <span>{r.cycle.name}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.agencyFirst ? agencyName(r.agencyFirst) : r.anyAgency ? "Cualquiera" : "—"}</div>
                    {r.agencySecond && <div className="text-xs text-zinc-500">2ª: {agencyName(r.agencySecond)}</div>}
                    {r.anyAgency && r.agencyFirst && <div className="text-xs text-zinc-500">Abierta a cualquiera</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.scoreTotal != null ? (
                      <span className="text-base font-bold">{r.scoreTotal}</span>
                    ) : (
                      <span className="text-xs text-zinc-600">
                        {EVAL_STATUS[(r.evaluations.find((e) => e.rubricVersion === r.rubricVersion)?.status ?? "PENDING") as keyof typeof EVAL_STATUS] ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.humanRating ? `${r.humanRating}/5` : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} label={statusLabel(r.status)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{dateFmt.format(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between">
          {filters.page > 1 ? (
            <Link className="a-btn a-btn-light" href={`/admin/postulaciones${filtersToQuery(filters, { page: filters.page - 1 })}`}>
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          {filters.page < pages && (
            <Link className="a-btn a-btn-light" href={`/admin/postulaciones${filtersToQuery(filters, { page: filters.page + 1 })}`}>
              Siguiente →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function Select({
  id,
  label,
  value,
  options,
  placeholder = "Todas",
}: {
  id: string;
  label: string;
  value?: string;
  options: readonly { id: string; label: string }[];
  placeholder?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select id={id} name={id} defaultValue={value ?? ""} className="a-input mt-1">
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
