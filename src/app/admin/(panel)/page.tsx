import Link from "next/link";
import { AGENCIES } from "@/config/agencies";
import { getLaunchItems } from "@/config/launch";
import { STATUSES } from "@/config/statuses";
import { DIMENSIONS, SCORE_DISCLAIMER } from "@/lib/dimensions";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

type Breakdown = { id: string; score: number; max: number }[];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;

  const [total, pending, duplicates, byAgency, byStatus, funnel, recent, notifIssues] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: "NUEVO" } }),
    prisma.application.count({ where: { possibleDuplicate: true } }),
    prisma.application.groupBy({ by: ["agencyFirst"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.funnelDaily.aggregate({ _sum: { started: true } }),
    prisma.application.findMany({ select: { scoreBreakdown: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.notification.count({ where: { status: { in: ["FAILED", "NOT_CONFIGURED"] } } }),
  ]);

  const started = funnel._sum.started ?? 0;
  const dimAvg = DIMENSIONS.map((d) => {
    let sum = 0;
    let max = 0;
    for (const r of recent) {
      const b = (r.scoreBreakdown as Breakdown).find((x) => x.id === d.id);
      if (b) {
        sum += b.score;
        max = b.max;
      }
    }
    return { ...d, avg: recent.length ? sum / recent.length : 0, max };
  });
  const launch = getLaunchItems();

  return (
    <div className="space-y-8">
      {error === "permiso" && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Tu rol no tiene permiso para esa sección.
        </p>
      )}
      <div>
        <h1 className="text-2xl font-bold">Resumen</h1>
        <p className="mt-1 text-sm text-zinc-600">{SCORE_DISCLAIMER}</p>
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Formularios iniciados" value={started} hint="Conteo anónimo por día" />
        <Stat label="Postulaciones completas" value={total} hint={started ? `${Math.round((total / started) * 100)}% de los iniciados` : undefined} />
        <Stat label="Pendientes de revisión" value={pending} href="/admin/postulaciones?status=NUEVO" />
        <Stat label="Posibles duplicados" value={duplicates} href="/admin/postulaciones?duplicates=only" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="a-card p-5">
          <h2 className="font-bold">Por agencia (primera opción)</h2>
          <ul className="mt-4 space-y-3">
            {[...AGENCIES.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null, name: "Sin preferencia (cualquiera)" }].map((a) => {
              const n = byAgency.find((b) => b.agencyFirst === a.id)?._count._all ?? 0;
              return <Bar key={a.name} label={a.name} value={n} max={Math.max(total, 1)} display={String(n)} />;
            })}
          </ul>
        </section>
        <section className="a-card p-5">
          <h2 className="font-bold">Promedio por dimensión</h2>
          <p className="text-sm text-zinc-600">Últimas {recent.length} postulaciones.</p>
          <ul className="mt-4 space-y-3">
            {dimAvg.map((d) => (
              <Bar key={d.id} label={d.label} value={d.avg} max={d.max || 1} display={`${d.avg.toFixed(1)} / ${d.max}`} />
            ))}
          </ul>
        </section>
      </div>

      <section className="a-card p-5">
        <h2 className="font-bold">Por estado</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/postulaciones?status=${s.id}`} className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm hover:border-zinc-900">
                {s.label} <strong>{byStatus.find((b) => b.status === s.id)?._count._all ?? 0}</strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {notifIssues > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Hay {notifIssues} notificaciones que no se enviaron (fallidas o sin configuración).{" "}
          <Link href="/admin/notificaciones" className="font-semibold underline">
            Revisar
          </Link>
        </p>
      )}

      <section className="a-card p-5">
        <h2 className="font-bold">Pendientes para lanzar a producción</h2>
        {launch.length === 0 ? (
          <p className="mt-2 text-sm text-green-800">Sin pendientes.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {launch.map((i) => (
              <li key={i.id} className="flex gap-3 text-sm">
                <span className={`mt-0.5 h-fit rounded px-2 py-0.5 text-xs font-bold ${i.level === "blocker" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                  {i.level === "blocker" ? "Bloquea" : "Pendiente"}
                </span>
                <span>
                  <strong>{i.title}.</strong> {i.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: number; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="a-card block p-4 hover:border-zinc-900">
      {body}
    </Link>
  ) : (
    <div className="a-card p-4">{body}</div>
  );
}

function Bar({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <li>
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{display}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-zinc-200" aria-hidden="true">
        <div className="h-2 rounded-full bg-red-600" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
