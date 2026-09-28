import Link from "next/link";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { CYCLE_STATUS, DEFAULT_TARGET, DEFAULT_THRESHOLD, type CycleStatus } from "@/server/cycles";
import { CURRENT_RUBRIC_VERSION } from "@/server/evaluation/rubrics";
import { createCycleAction } from "./actions";
import { CycleBadge } from "./ui";

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

export default async function CyclesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser("applications:view");
  const { error } = await searchParams;
  const [cycles, unassigned] = await Promise.all([
    prisma.recruitmentCycle.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { applications: true } } },
    }),
    prisma.application.count({ where: { cycleId: null } }),
  ]);
  const active = cycles.find((c) => c.status !== "CLOSED");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Convocatorias</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Cada convocatoria agrupa postulaciones, las evalúa con una versión fija de la rúbrica y, al cerrarse, genera una
          shortlist de hasta N perfiles recomendados para entrevista. La decisión de contactar, entrevistar o contratar es del
          equipo.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {error}
        </p>
      )}
      {!active && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          No hay convocatoria abierta. Las postulaciones nuevas se guardan sin convocatoria
          {unassigned ? ` (${unassigned} actualmente)` : ""} hasta que abras una.
        </p>
      )}

      {cycles.length === 0 ? (
        <div className="a-card p-8 text-center text-zinc-600">Aún no hay convocatorias.</div>
      ) : (
        <div className="a-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Convocatorias</caption>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th scope="col" className="px-4 py-3">Convocatoria</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">Periodo</th>
                <th scope="col" className="px-4 py-3 text-right">Postulaciones</th>
                <th scope="col" className="px-4 py-3">Parámetros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/convocatorias/${c.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-zinc-500">Rúbrica {c.rubricVersion}</div>
                  </td>
                  <td className="px-4 py-3">
                    <CycleBadge status={c.status as CycleStatus} />
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {dateFmt.format(c.startsAt)} – {c.endsAt ? dateFmt.format(c.endsAt) : "sin fecha límite"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c._count.applications}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    Hasta {c.targetCount} · umbral {c.threshold}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {can(user.role, "cycles:manage") && !active && (
        <section className="a-card max-w-2xl p-5" aria-labelledby="new-h">
          <h2 id="new-h" className="font-bold">
            Abrir convocatoria
          </h2>
          <form action={createCycleAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="text-sm font-semibold">
                Nombre interno
              </label>
              <input id="name" name="name" required minLength={3} maxLength={120} className="a-input mt-1" placeholder="Asesores · octubre 2026" />
            </div>
            <div>
              <label htmlFor="startsAt" className="text-sm font-semibold">
                Inicio
              </label>
              <input id="startsAt" name="startsAt" type="date" required defaultValue={today} className="a-input mt-1" />
            </div>
            <div>
              <label htmlFor="endsAt" className="text-sm font-semibold">
                Fecha límite (opcional)
              </label>
              <input id="endsAt" name="endsAt" type="date" className="a-input mt-1" />
            </div>
            <div>
              <label htmlFor="targetCount" className="text-sm font-semibold">
                Recomendaciones objetivo
              </label>
              <input id="targetCount" name="targetCount" type="number" min={1} max={50} required defaultValue={DEFAULT_TARGET} className="a-input mt-1" />
            </div>
            <div>
              <label htmlFor="threshold" className="text-sm font-semibold">
                Umbral mínimo (0–100)
              </label>
              <input id="threshold" name="threshold" type="number" min={0} max={100} step="0.5" required defaultValue={DEFAULT_THRESHOLD} className="a-input mt-1" />
              <p className="mt-1 text-xs text-amber-800">70 es un valor inicial por validar con el equipo, no un estándar científico.</p>
            </div>
            {unassigned > 0 && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="includeUnassigned" /> Incluir las {unassigned} postulaciones sin convocatoria (sólo las del desafío vigente)
              </label>
            )}
            <p className="text-xs text-zinc-500 sm:col-span-2">Se usará la rúbrica vigente: {CURRENT_RUBRIC_VERSION}.</p>
            <div className="sm:col-span-2">
              <button className="a-btn a-btn-red" type="submit">
                Abrir convocatoria
              </button>
            </div>
          </form>
        </section>
      )}
      <p className="text-xs text-zinc-500">Estados: {Object.values(CYCLE_STATUS).join(" · ")}.</p>
    </div>
  );
}
