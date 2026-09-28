import Link from "next/link";
import { notFound } from "next/navigation";
import { agencyName } from "@/config/agencies";
import { statusLabel } from "@/config/statuses";
import { SCORE_DISCLAIMER } from "@/lib/dimensions";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { computeCycleShortlist, cycleCounts, type CycleStatus, type ShortlistSnapshot } from "@/server/cycles";
import { getRubric } from "@/server/evaluation/rubrics";
import { EVAL_STATUS } from "@/server/evaluation/service";
import type { ShortlistComputation } from "@/server/evaluation/shortlist";
import type { DimensionResult } from "@/server/evaluation/types";
import { NOTIFICATION_STATUS, channelStatus } from "@/server/notifications/service";
import { StatusBadge } from "../../ui";
import { CycleBadge } from "../ui";
import {
  closeCycleAction,
  markNotSelectedAction,
  newVersionAction,
  queueManualAction,
  queueRetryAction,
  quickStatusAction,
  resendNoticeAction,
  retryAllAction,
  reviewToggleAction,
  updateSettingsAction,
} from "../actions";

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" });

const OK: Record<string, string> = {
  creada: "Convocatoria abierta.",
  parametros: "Parámetros actualizados.",
  cerrada: "Convocatoria cerrada y shortlist calculada.",
  reenviado: "Aviso reenviado.",
  version: "Nueva versión abierta con las postulaciones posteriores al cierre.",
  marcadas: "Estados actualizados.",
  reintento: "Reintento ejecutado.",
  manual: "Enviada a revisión manual.",
  estado: "Estado actualizado.",
};

export default async function CycleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; cierre?: string; n?: string }>;
}) {
  const user = await requireUser("applications:view");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^c[a-z0-9]{20,30}$/.test(id)) notFound();
  const found = await prisma.recruitmentCycle.findUnique({
    where: { id },
    include: {
      closedBy: { select: { name: true } },
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
    },
  });
  if (!found) notFound();
  const cycle = found;
  const status = cycle.status as CycleStatus;
  const closed = status === "CLOSED";
  const rubric = getRubric(cycle.rubricVersion);
  const manage = can(user.role, "cycles:manage");
  const manageEval = can(user.role, "evaluations:manage");
  const changeStatus = can(user.role, "applications:status");

  const counts = await cycleCounts(cycle.id, cycle.rubricVersion);
  const live = await computeCycleShortlist(cycle.id);
  const view: ShortlistComputation = closed && cycle.shortlist ? (cycle.shortlist as unknown as ShortlistSnapshot) : live.computation;
  const snapshot = closed ? (cycle.shortlist as unknown as ShortlistSnapshot | null) : null;

  const ids = [
    ...view.ranked.slice(0, 60).map((r) => r.applicationId),
    ...view.manualReview.map((m) => m.applicationId),
    ...live.computation.blocked.map((b) => b.applicationId),
    ...view.ineligible.map((i) => i.applicationId),
  ];
  const [apps, late, notices, channels] = await Promise.all([
    prisma.application.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        agencyFirst: true,
        agencySecond: true,
        anyAgency: true,
        status: true,
        cv: { select: { id: true } },
        evaluations: { where: { rubricVersion: cycle.rubricVersion }, select: { status: true, dimensions: true, total: true, lastError: true, source: true } },
      },
    }),
    prisma.application.findMany({ where: { cycleId: cycle.id, afterClose: true }, select: { id: true, code: true, firstName: true, lastName: true, createdAt: true } }),
    prisma.notification.findMany({ where: { cycleId: cycle.id, kind: "SHORTLIST" }, orderBy: { createdAt: "asc" } }),
    channelStatus(),
  ]);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const recommendedIds = new Set(view.recommended.map((r) => r.applicationId));
  const tiedIds = new Set(view.tie?.applicationIds ?? []);

  return (
    <div className="space-y-6">
      <Link href="/admin/convocatorias" className="text-sm font-semibold underline underline-offset-2">
        ← Convocatorias
      </Link>
      {sp.ok && OK[sp.ok] && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
          {OK[sp.ok]}
          {sp.ok === "marcadas" && sp.n ? ` (${sp.n})` : ""}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {sp.error}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
            {cycle.name} <CycleBadge status={status} />
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Inicio {dateFmt.format(cycle.startsAt)}
            {cycle.endsAt ? ` · Fecha límite ${dateFmt.format(cycle.endsAt)}` : " · Sin fecha límite"} · Rúbrica {cycle.rubricVersion} ·{" "}
            {cycle.eligibilityVersion}
          </p>
          {cycle.parent && (
            <p className="text-sm">
              Versión de:{" "}
              <Link className="underline" href={`/admin/convocatorias/${cycle.parent.id}`}>
                {cycle.parent.name}
              </Link>
            </p>
          )}
          {cycle.children.map((c) => (
            <p key={c.id} className="text-sm">
              Nueva versión:{" "}
              <Link className="underline" href={`/admin/convocatorias/${c.id}`}>
                {c.name}
              </Link>
            </p>
          ))}
        </div>
      </header>

      {!closed && (
        <p role="status" className="sticky top-0 z-10 rounded-md border-2 border-amber-400 bg-amber-100 p-3 font-semibold text-amber-950">
          Ranking provisional — la convocatoria sigue abierta. Las posiciones pueden cambiar con nuevas candidaturas; no se envía
          aviso final hasta cerrarla.
        </p>
      )}
      <p className="text-sm text-zinc-600">{SCORE_DISCLAIMER} La herramienta recomienda a quién revisar para entrevista; la decisión final es del equipo.</p>

      <section aria-label="Conteos" className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Postulaciones completas" value={counts.complete} />
        <Stat label="Evaluadas" value={counts.evaluated} />
        <Stat label="Pendientes de evaluación" value={counts.pending} tone={counts.pending ? "warn" : undefined} />
        <Stat label="Evaluación fallida" value={counts.failed} tone={counts.failed ? "bad" : undefined} />
        <Stat label="Revisión manual" value={counts.manualReview} tone={counts.manualReview ? "warn" : undefined} />
        <Stat label="Posteriores al cierre" value={counts.late} />
      </section>

      {/* ---------- Parámetros ---------- */}
      <section className="a-card p-5" aria-labelledby="params-h">
        <h2 id="params-h" className="font-bold">
          Parámetros
        </h2>
        {manage && !closed ? (
          <form action={updateSettingsAction} className="mt-3 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="id" value={cycle.id} />
            <div className="sm:col-span-2">
              <label htmlFor="name" className="text-sm font-semibold">
                Nombre interno
              </label>
              <input id="name" name="name" defaultValue={cycle.name} required minLength={3} maxLength={120} className="a-input mt-1" />
            </div>
            <div>
              <label htmlFor="endsAt" className="text-sm font-semibold">
                Fecha límite
              </label>
              <input id="endsAt" name="endsAt" type="date" defaultValue={cycle.endsAt ? dayFmt.format(cycle.endsAt) : ""} className="a-input mt-1" />
            </div>
            <div>
              <label htmlFor="targetCount" className="text-sm font-semibold">
                Recomendaciones
              </label>
              <input id="targetCount" name="targetCount" type="number" min={1} max={50} defaultValue={cycle.targetCount} className="a-input mt-1" />
            </div>
            <div>
              <label htmlFor="threshold" className="text-sm font-semibold">
                Umbral (0–100)
              </label>
              <input id="threshold" name="threshold" type="number" min={0} max={100} step="0.5" defaultValue={cycle.threshold} className="a-input mt-1" />
            </div>
            <p className="self-end text-xs text-amber-800 sm:col-span-2">
              El umbral inicial de 70 es un parámetro por validar con el equipo; no es un estándar científico.
            </p>
            <div className="self-end">
              <button className="a-btn" type="submit">
                Guardar parámetros
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-2 text-sm">
            Hasta <strong>{cycle.targetCount}</strong> recomendaciones · umbral <strong>{cycle.threshold}</strong>/100 (parámetro por validar).
          </p>
        )}
        {manage && !closed && (
          <form action={reviewToggleAction} className="mt-3">
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="review" value={status === "OPEN" ? "1" : "0"} />
            <button className="a-btn a-btn-light" type="submit">
              {status === "OPEN" ? "Pasar a “En revisión” (dejar de recibir en esta convocatoria)" : "Reabrir para recibir postulaciones"}
            </button>
          </form>
        )}
      </section>

      {/* ---------- Cola de evaluaciones ---------- */}
      {(live.computation.blocked.length > 0 || view.manualReview.length > 0 || sp.cierre === "bloqueado") && (
        <section className="a-card p-5" aria-labelledby="queue-h">
          <h2 id="queue-h" className="font-bold">
            Evaluaciones por resolver
          </h2>
          {sp.cierre === "bloqueado" && (
            <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              No se cerró la convocatoria: hay evaluaciones pendientes o fallidas. Ninguna se trata como cero ni se excluye en
              silencio. Reinténtalas o envíalas a revisión manual.
            </p>
          )}
          {live.computation.blocked.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Pendientes o fallidas ({live.computation.blocked.length}) · bloquean el cierre</h3>
                {manageEval && (
                  <form action={retryAllAction}>
                    <input type="hidden" name="id" value={cycle.id} />
                    <button className="a-btn a-btn-light" type="submit">
                      Reintentar todas
                    </button>
                  </form>
                )}
              </div>
              <ul className="mt-2 divide-y divide-zinc-100 text-sm">
                {live.computation.blocked.map((b) => {
                  const a = byId.get(b.applicationId);
                  const ev = a?.evaluations[0];
                  return (
                    <li key={b.applicationId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/admin/postulaciones/${b.applicationId}`} className="font-semibold underline">
                          {a ? `${a.firstName} ${a.lastName}` : b.code}
                        </Link>{" "}
                        <span className="font-mono text-xs text-zinc-500">{b.code}</span> ·{" "}
                        {EVAL_STATUS[b.status as keyof typeof EVAL_STATUS] ?? "Sin evaluación"}
                        {ev?.lastError && <span className="block text-xs text-red-800">{ev.lastError}</span>}
                      </span>
                      {manageEval && (
                        <span className="flex gap-2">
                          <form action={queueRetryAction}>
                            <input type="hidden" name="cycleId" value={cycle.id} />
                            <input type="hidden" name="applicationId" value={b.applicationId} />
                            <button className="a-btn a-btn-light" type="submit">
                              Reintentar
                            </button>
                          </form>
                          <form action={queueManualAction}>
                            <input type="hidden" name="cycleId" value={cycle.id} />
                            <input type="hidden" name="applicationId" value={b.applicationId} />
                            <button className="a-btn a-btn-light" type="submit">
                              Enviar a revisión manual
                            </button>
                          </form>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {view.manualReview.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold">
                Revisión manual ({view.manualReview.length}) · separadas del ranking automático hasta que una persona las califique o confirme
              </h3>
              <ul className="mt-2 divide-y divide-zinc-100 text-sm">
                {view.manualReview.map((m) => {
                  const a = byId.get(m.applicationId);
                  return (
                    <li key={m.applicationId} className="py-2">
                      <Link href={`/admin/postulaciones/${m.applicationId}`} className="font-semibold underline">
                        {a ? `${a.firstName} ${a.lastName}` : m.code}
                      </Link>{" "}
                      <span className="font-mono text-xs text-zinc-500">{m.code}</span>
                      {m.reasons.length > 0 && <span className="block text-xs text-amber-900">{m.reasons.join(" · ")}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ---------- Shortlist ---------- */}
      <section className="a-card p-5" aria-labelledby="sl-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sl-h" className="text-lg font-bold">
            {closed ? `Shortlist final (versión ${snapshot?.version ?? 1})` : "Ranking provisional"}
          </h2>
          {closed && snapshot && (
            <p className="text-sm text-zinc-600">
              Cerrada por {cycle.closedBy?.name ?? "—"} el {cycle.closedAt ? dateFmt.format(cycle.closedAt) : "—"} · rúbrica {snapshot.rubricVersion} ·
              umbral {snapshot.threshold} · máximo {snapshot.targetCount}
            </p>
          )}
        </div>
        <p className="mt-2 text-sm">
          {view.recommended.length === 0
            ? `Ningún perfil evaluado alcanza el umbral de ${view.threshold}. No se rellenan lugares con perfiles bajo el umbral.`
            : `${view.recommended.length} perfil(es) ${closed ? "recomendados" : "en posición de recomendación (provisional)"} con ${view.threshold} o más, hasta ${view.targetCount}.`}
          {view.recommended.length > 0 && view.recommended.length < view.targetCount && " Sólo se recomiendan quienes alcanzan el umbral."}
          {view.belowThresholdCount > 0 && ` ${view.belowThresholdCount} evaluado(s) quedan bajo el umbral.`}
        </p>
        {view.tie && (
          <p role="alert" className="mt-3 rounded-md border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
            <strong>Empate en el último lugar:</strong> {view.tie.applicationIds.length} personas tienen {view.tie.total} puntos y quedan{" "}
            {view.tie.openSlots} lugar(es). Se incluyen todas para revisión; el equipo debe resolver el empate. El sistema no
            desempata por orden de llegada, nombre ni ningún dato personal.
          </p>
        )}

        <ol className="mt-4 space-y-3">
          {view.recommended.map((r) => {
            const a = byId.get(r.applicationId);
            if (!a) return null;
            const ev = a.evaluations[0];
            const dims = (ev?.dimensions ?? []) as DimensionResult[];
            return (
              <li key={r.applicationId} className={`rounded-lg border p-4 ${tiedIds.has(r.applicationId) ? "border-amber-400" : "border-zinc-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-500">
                      Posición {r.rank}
                      {tiedIds.has(r.applicationId) ? " (empate)" : ""}
                    </p>
                    <Link href={`/admin/postulaciones/${a.id}`} className="text-lg font-bold underline-offset-2 hover:underline">
                      {a.firstName} {a.lastName}
                    </Link>{" "}
                    <span className="font-mono text-xs text-zinc-500">{a.code}</span>
                    <p className="text-sm">
                      Agencia: {a.agencyFirst ? agencyName(a.agencyFirst) : a.anyAgency ? "Cualquiera" : "—"}
                      {a.agencySecond ? ` · 2ª: ${agencyName(a.agencySecond)}` : ""}
                    </p>
                    <p className="text-sm">
                      <a href={`tel:+52${a.phone}`} className="underline">
                        {a.phone.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3")}
                      </a>
                      {a.email ? ` · ${a.email}` : ""}
                      {a.cv && (
                        <>
                          {" · "}
                          <a href={`/admin/cv/${a.id}`} className="underline">
                            CV
                          </a>
                        </>
                      )}
                    </p>
                    <p className="mt-1">
                      <StatusBadge status={a.status} label={statusLabel(a.status)} />
                    </p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums">
                    {r.total}
                    <span className="text-base font-normal text-zinc-500"> / 100</span>
                  </p>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold">Evidencia por dimensión{ev?.source === "MANUAL" ? " (calificación manual)" : ""}</summary>
                  <ul className="mt-2 space-y-2 text-sm">
                    {rubric.dimensions.map((d) => {
                      const x = dims.find((y) => y.id === d.id);
                      return (
                        <li key={d.id} className="rounded-md bg-zinc-50 p-2">
                          <strong>{d.label}</strong>: {x ? `${x.score}/4 → ${Math.round((x.score / 4) * d.weight * 10) / 10}/${d.weight}` : "—"}
                          {x && <span className="text-zinc-500"> · confianza {x.confidence}</span>}
                          {x?.evidence && <blockquote className="mt-1 border-l-2 border-zinc-400 pl-2 italic">“{x.evidence}”</blockquote>}
                          {x && <p className="mt-1 text-zinc-700">{x.rationale}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
                {changeStatus && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      [
                        ["INVITAR_ENTREVISTA", "Invitar a entrevista"],
                        ["REVISION_MANUAL", "Revisar manualmente"],
                        ["NO_SELECCIONADA", "No continúa en esta ronda"],
                      ] as const
                    ).map(([value, label]) => (
                      <form key={value} action={quickStatusAction}>
                        <input type="hidden" name="cycleId" value={cycle.id} />
                        <input type="hidden" name="applicationId" value={a.id} />
                        <input type="hidden" name="status" value={value} />
                        <button className={`a-btn ${a.status === value ? "" : "a-btn-light"}`} type="submit" aria-pressed={a.status === value}>
                          {label}
                        </button>
                      </form>
                    ))}
                    <Link href={`/admin/postulaciones/${a.id}#notes-h`} className="a-btn a-btn-light">
                      Nota interna
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {view.ranked.length > view.recommended.length && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold">Resto del ranking evaluado ({view.ranked.length - view.recommended.length})</summary>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th scope="col" className="py-1">Pos.</th>
                  <th scope="col" className="py-1">Persona</th>
                  <th scope="col" className="py-1 text-right">Puntaje</th>
                </tr>
              </thead>
              <tbody>
                {view.ranked
                  .filter((r) => !recommendedIds.has(r.applicationId))
                  .slice(0, 50)
                  .map((r) => {
                    const a = byId.get(r.applicationId);
                    return (
                      <tr key={r.applicationId} className="border-t border-zinc-100">
                        <td className="py-1 tabular-nums">{r.rank}</td>
                        <td className="py-1">
                          <Link href={`/admin/postulaciones/${r.applicationId}`} className="underline">
                            {a ? `${a.firstName} ${a.lastName}` : r.code}
                          </Link>
                          {r.total < view.threshold && <span className="ml-2 text-xs text-zinc-500">bajo el umbral</span>}
                        </td>
                        <td className="py-1 text-right tabular-nums">{r.total}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </details>
        )}
        {view.ineligible.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">No elegibles por requisitos mínimos ({view.ineligible.length})</summary>
            <p className="mt-1 text-xs text-zinc-500">{rubric.eligibility.description}</p>
            <ul className="mt-2 text-sm">
              {view.ineligible.map((i) => (
                <li key={i.applicationId}>
                  <Link href={`/admin/postulaciones/${i.applicationId}`} className="underline">
                    {i.code}
                  </Link>{" "}
                  — {i.reasons.join("; ")}
                </li>
              ))}
            </ul>
          </details>
        )}

        {manage && !closed && (
          <form action={closeCycleAction} className="mt-6 space-y-2 rounded-md border-2 border-zinc-900 p-4">
            <input type="hidden" name="id" value={cycle.id} />
            <h3 className="font-bold">Cerrar y calcular shortlist</h3>
            <p className="text-sm text-zinc-700">
              Reintenta evaluaciones pendientes; si alguna sigue sin finalizar, el cierre se detiene. Al cerrar se guarda una
              instantánea con la rúbrica {cycle.rubricVersion}, la convocatoria pasa a “Cerrada” y se envía un solo aviso a cada
              destinatario configurado. Las postulaciones que lleguen después quedarán marcadas como posteriores al cierre.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" required /> Confirmo que quiero cerrar la convocatoria
            </label>
            <button className="a-btn a-btn-red" type="submit">
              Cerrar y calcular shortlist
            </button>
          </form>
        )}
        {manage && closed && (
          <form action={markNotSelectedAction} className="mt-6 space-y-2 rounded-md border border-zinc-300 p-4">
            <input type="hidden" name="id" value={cycle.id} />
            <h3 className="text-sm font-bold">Marcar “No continúa en esta ronda” al resto</h3>
            <p className="text-xs text-zinc-600">
              Sólo cambia el estado interno de quienes siguen en “Nuevo” o “En revisión” y no están en la shortlist ni en revisión
              manual. No borra ni envía nada a las personas candidatas.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" required /> El equipo lo confirmó
            </label>
            <button className="a-btn a-btn-light" type="submit">
              Marcar resto
            </button>
          </form>
        )}
      </section>

      {/* ---------- Avisos ---------- */}
      <section className="a-card p-5" aria-labelledby="notice-h">
        <h2 id="notice-h" className="font-bold">
          Aviso de shortlist
        </h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">WhatsApp</dt>
            <dd>
              {channels.whatsapp.configured
                ? `Configurado (${channels.whatsapp.provider})`
                : channels.whatsapp.simulated
                  ? "Simulado en consola (desarrollo): no envía mensajes"
                  : "Pendiente de configuración"}
              {channels.whatsapp.lastSentAt ? ` · último envío ${dateFmt.format(channels.whatsapp.lastSentAt)}` : " · sin envíos"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Correo (respaldo)</dt>
            <dd>
              {channels.email.configured ? "Configurado (SMTP)" : "No configurado"}
              {channels.email.lastSentAt ? ` · último envío ${dateFmt.format(channels.email.lastSentAt)}` : ""}
            </dd>
          </div>
        </dl>
        {!closed ? (
          <p className="mt-3 text-sm text-zinc-600">El aviso final se envía sólo al cerrar la convocatoria.</p>
        ) : notices.length === 0 ? (
          <p className="mt-3 text-sm">Sin registros de aviso.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Avisos de shortlist</caption>
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th scope="col" className="py-1">Destinatario</th>
                <th scope="col" className="py-1">Canal</th>
                <th scope="col" className="py-1">Estado</th>
                <th scope="col" className="py-1">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id} className="border-t border-zinc-100 align-top">
                  <td className="py-1">
                    {n.recipientLabel} <span className="text-zinc-500">{n.recipientMasked}</span>
                  </td>
                  <td className="py-1">
                    {n.channel} · {n.provider}
                  </td>
                  <td className="py-1 font-semibold">
                    {NOTIFICATION_STATUS[n.status as keyof typeof NOTIFICATION_STATUS] ?? n.status}
                    {n.lastError && <span className="block text-xs font-normal text-zinc-600">{n.lastError}</span>}
                  </td>
                  <td className="py-1">{dateFmt.format(n.sentAt ?? n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {manage && closed && (
          <form action={resendNoticeAction} className="mt-3">
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="seq" value={cycle.noticeSeq} />
            <button className="a-btn a-btn-light" type="submit">
              Reenviar aviso
            </button>
            <span className="ml-2 text-xs text-zinc-500">Queda auditado; un doble clic no duplica el envío.</span>
          </form>
        )}
      </section>

      {/* ---------- Posteriores al cierre ---------- */}
      {late.length > 0 && (
        <section className="a-card p-5" aria-labelledby="late-h">
          <h2 id="late-h" className="font-bold">
            Postulaciones posteriores al cierre ({late.length})
          </h2>
          <p className="mt-1 text-sm text-zinc-600">No se agregaron a la shortlist cerrada. Puedes abrir una nueva versión de la convocatoria para evaluarlas.</p>
          <ul className="mt-2 text-sm">
            {late.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/postulaciones/${l.id}`} className="underline">
                  {l.firstName} {l.lastName}
                </Link>{" "}
                <span className="font-mono text-xs text-zinc-500">{l.code}</span> · {dateFmt.format(l.createdAt)}
              </li>
            ))}
          </ul>
          {manage && closed && (
            <form action={newVersionAction} className="mt-3">
              <input type="hidden" name="id" value={cycle.id} />
              <button className="a-btn" type="submit">
                Abrir nueva versión con estas postulaciones
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "border-red-300 bg-red-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : "";
  return (
    <div className={`a-card p-3 ${color}`}>
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
