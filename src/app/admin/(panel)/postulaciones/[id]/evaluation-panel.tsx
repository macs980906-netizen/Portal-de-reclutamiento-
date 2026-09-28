import type { Prisma } from "@prisma/client";
import { DIMENSIONS as LEGACY_DIMENSIONS, SCORE_DISCLAIMER, dimensionLabel } from "@/lib/dimensions";
import { getRubric, hasRubric } from "@/server/evaluation/rubrics";
import { EVAL_STATUS, type EvalStatus } from "@/server/evaluation/service";
import type { DimensionResult } from "@/server/evaluation/types";
import {
  confirmAiEvaluationAction,
  manualEvaluationAction,
  manualReviewAction,
  retryEvaluationAction,
} from "./evaluation-actions";

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

type EvaluationRow = {
  status: string;
  source: string;
  provider: string | null;
  model: string | null;
  rubricVersion: string;
  dimensions: Prisma.JsonValue;
  aiDimensions: Prisma.JsonValue;
  total: number | null;
  reviewReasons: Prisma.JsonValue;
  lastError: string | null;
  attempts: number;
  completedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: { name: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-900",
  NEEDS_REVIEW: "bg-amber-100 text-amber-900",
  FAILED: "bg-red-100 text-red-900",
  PENDING: "bg-zinc-200 text-zinc-800",
  RUNNING: "bg-blue-100 text-blue-900",
};

export function EvaluationPanel({
  applicationId,
  evaluation,
  canManage,
  vehicleExperience,
  hasCv,
}: {
  applicationId: string;
  evaluation: EvaluationRow | null;
  canManage: boolean;
  vehicleExperience: string;
  hasCv: boolean;
}) {
  const rubric = evaluation && hasRubric(evaluation.rubricVersion) ? getRubric(evaluation.rubricVersion) : null;
  const dims = (evaluation?.dimensions ?? []) as DimensionResult[];
  const reasons = (Array.isArray(evaluation?.reviewReasons) ? evaluation!.reviewReasons : []) as string[];
  const status = (evaluation?.status ?? "PENDING") as EvalStatus;

  return (
    <section className="a-card p-5" aria-labelledby="score-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="score-h" className="font-bold">
          Evaluación del desafío
        </h2>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? ""}`}>{EVAL_STATUS[status] ?? status}</span>
          {evaluation?.total != null && (
            <p className="text-3xl font-bold tabular-nums">
              {evaluation.total}
              <span className="text-base font-normal text-zinc-500"> / 100</span>
            </p>
          )}
        </div>
      </div>
      <p role="note" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
        {SCORE_DISCLAIMER} Es una herramienta de priorización basada en una rúbrica de trabajo, no una prueba validada
        científicamente.
      </p>

      {status === "PENDING" && (
        <p className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm">
          Evaluación pendiente{evaluation?.lastError ? `: ${evaluation.lastError}` : "."} No se muestra ningún puntaje hasta
          que exista una evaluación real o manual.
        </p>
      )}
      {status === "FAILED" && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          La evaluación falló ({evaluation?.attempts} intento/s): {evaluation?.lastError ?? "error desconocido"}. Reintenta o envíala a
          revisión manual. Mientras tanto bloquea el cierre de la convocatoria.
        </p>
      )}
      {reasons.length > 0 && status !== "COMPLETED" && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Requiere revisión humana (no entra al ranking automático hasta resolverse):</p>
          <ul className="mt-1 list-disc pl-5">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {rubric && dims.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Calificación por dimensión con evidencia</caption>
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th scope="col" className="py-2 pr-3">Dimensión</th>
                <th scope="col" className="py-2 pr-3">Escala</th>
                <th scope="col" className="py-2 pr-3">Puntos</th>
                <th scope="col" className="py-2">Evidencia y criterio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 align-top">
              {rubric.dimensions.map((d) => {
                const r = dims.find((x) => x.id === d.id);
                const points = r ? Math.round((r.score / 4) * d.weight * 10) / 10 : 0;
                return (
                  <tr key={d.id}>
                    <th scope="row" className="py-3 pr-3 font-semibold">
                      {d.label}
                      <span className="block text-xs font-normal text-zinc-500">Peso {d.weight}</span>
                    </th>
                    <td className="py-3 pr-3 tabular-nums">{r ? `${r.score} / 4` : "—"}</td>
                    <td className="py-3 pr-3 tabular-nums">
                      {points} / {d.weight}
                    </td>
                    <td className="py-3">
                      {r?.evidence ? (
                        <blockquote className="border-l-2 border-zinc-400 pl-2 italic text-zinc-800">“{r.evidence}”</blockquote>
                      ) : (
                        <p className="text-zinc-500">Sin evidencia citada.</p>
                      )}
                      {r && <p className="mt-1">{r.rationale}</p>}
                      {r && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Confianza: <strong>{r.confidence}</strong>
                          {r.needs_human_review && <span className="ml-2 font-semibold text-amber-800">· Revisión: {r.review_reason || "sí"}</span>}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500">
        Rúbrica {evaluation?.rubricVersion ?? "—"} · Fuente: {evaluation?.source === "MANUAL" ? "calificación manual" : "IA"}
        {evaluation?.provider ? ` (${evaluation.provider}${evaluation.model ? ` · ${evaluation.model}` : ""})` : ""}
        {evaluation?.completedAt ? ` · ${dateFmt.format(evaluation.completedAt)}` : ""}
        {evaluation?.reviewedBy ? ` · Revisó: ${evaluation.reviewedBy.name}` : ""}
        {evaluation?.aiDimensions ? " · Se conserva el resultado previo de la IA" : ""}.
        <br />
        Señales de contexto que no suman al puntaje — ventas de vehículos: <strong>{vehicleExperience}</strong> · CV:{" "}
        <strong>{hasCv ? "adjuntó" : "no adjuntó (no resta)"}</strong>.
      </p>

      {canManage && (
        <div className="mt-5 space-y-4 border-t border-zinc-200 pt-4">
          <div className="flex flex-wrap gap-2">
            {(status === "FAILED" || status === "PENDING" || (status === "NEEDS_REVIEW" && !dims.length)) && (
              <form action={retryEvaluationAction}>
                <input type="hidden" name="id" value={applicationId} />
                <button className="a-btn" type="submit">
                  Reintentar evaluación
                </button>
              </form>
            )}
            {status === "NEEDS_REVIEW" && dims.length > 0 && evaluation?.source === "AI" && (
              <form action={confirmAiEvaluationAction}>
                <input type="hidden" name="id" value={applicationId} />
                <button className="a-btn" type="submit">
                  Revisé la evidencia: confirmar evaluación
                </button>
              </form>
            )}
          </div>
          {status !== "NEEDS_REVIEW" && status !== "RUNNING" && (
            <form action={manualReviewAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={applicationId} />
              <div className="min-w-60 flex-1">
                <label htmlFor="mr-reason" className="text-sm font-semibold">
                  Enviar a revisión manual
                </label>
                <input id="mr-reason" name="reason" required minLength={3} maxLength={200} className="a-input mt-1" placeholder="Motivo breve" />
              </div>
              <button className="a-btn a-btn-light" type="submit">
                Enviar a revisión manual
              </button>
            </form>
          )}
          {rubric && (
            <details className="rounded-md border border-zinc-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Calificar manualmente con la rúbrica</summary>
              <form action={manualEvaluationAction} className="mt-3 space-y-4">
                <input type="hidden" name="id" value={applicationId} />
                <ul className="space-y-1 text-xs text-zinc-600">
                  {Object.entries(rubric.scale).map(([k, v]) => (
                    <li key={k}>
                      <strong>{k}</strong>: {v}
                    </li>
                  ))}
                </ul>
                {rubric.dimensions.map((d) => {
                  const current = dims.find((x) => x.id === d.id);
                  return (
                    <fieldset key={d.id} className="rounded-md border border-zinc-200 p-3">
                      <legend className="px-1 text-sm font-semibold">
                        {d.label} (peso {d.weight}) · preguntas {d.sources.join(", ").toUpperCase()}
                      </legend>
                      <p className="text-xs text-zinc-600">Se busca: {d.lookFor}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                        <label className="text-sm">
                          <span className="sr-only">Calificación de {d.label}</span>
                          <select name={`score_${d.id}`} defaultValue={current ? String(current.score) : ""} required className="a-input">
                            <option value="">0–4</option>
                            {[0, 1, 2, 3, 4].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="sr-only">Justificación de {d.label}</span>
                          <input name={`rationale_${d.id}`} required maxLength={600} defaultValue={current?.rationale ?? ""} placeholder="Justificación breve ligada a la rúbrica" className="a-input" />
                        </label>
                      </div>
                      <label className="mt-2 block text-sm">
                        <span className="sr-only">Evidencia de {d.label}</span>
                        <input name={`evidence_${d.id}`} maxLength={400} defaultValue={current?.evidence ?? ""} placeholder="Cita de la respuesta (opcional)" className="a-input" />
                      </label>
                    </fieldset>
                  );
                })}
                <button className="a-btn" type="submit">
                  Guardar evaluación manual
                </button>
              </form>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

type Breakdown = { id: string; score: number; max: number }[];
type Indicator = { source: string; text: string; tone: "positive" | "neutral" | "caution" };

/** Puntaje por reglas del desafío v1 (histórico, no se recalcula). */
export function LegacyScore({ app }: { app: { scoreTotal: number | null; scoreBreakdown: Prisma.JsonValue; scoreIndicators: Prisma.JsonValue; scoringVersion: string | null } }) {
  const breakdown = (app.scoreBreakdown ?? []) as Breakdown;
  const indicators = (app.scoreIndicators ?? []) as Indicator[];
  return (
    <section className="a-card p-5" aria-labelledby="score-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="score-h" className="font-bold">
          Puntaje orientativo (desafío v1, histórico)
        </h2>
        <p className="text-3xl font-bold tabular-nums">
          {app.scoreTotal != null ? Math.round(app.scoreTotal) : "—"}
          <span className="text-base font-normal text-zinc-500"> / 100</span>
        </p>
      </div>
      <p role="note" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
        {SCORE_DISCLAIMER}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {LEGACY_DIMENSIONS.map((d) => {
          const b = breakdown.find((x) => x.id === d.id);
          return (
            <li key={d.id} className="flex justify-between gap-2">
              <span>{dimensionLabel(d.id)}</span>
              <span className="font-semibold tabular-nums">
                {b?.score ?? 0} / {b?.max ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 space-y-1 text-sm">
        {indicators.map((i, idx) => (
          <li key={idx}>• {i.text}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-500">Reglas {app.scoringVersion ?? "—"}. Este expediente usa la versión anterior del desafío.</p>
    </section>
  );
}
