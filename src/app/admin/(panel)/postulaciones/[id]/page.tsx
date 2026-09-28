import Link from "next/link";
import { notFound } from "next/navigation";
import { agencyName } from "@/config/agencies";
import { PRIORITIES, STATUSES, statusLabel } from "@/config/statuses";
import { CHALLENGE } from "@/lib/challenge";
import { CHALLENGE_V1, CHALLENGE_V1_VERSION } from "@/lib/challenge-v1";
import {
  COMMUTE_OPTIONS,
  FOLLOWUP_OPTIONS,
  INTEREST_TOPIC_OPTIONS,
  INTERVIEW_AVAILABILITY_OPTIONS,
  SCHEDULE_TALK_OPTIONS,
  VEHICLE_EXPERIENCE_OPTIONS,
  YEARS_OPTIONS,
  optionLabel,
} from "@/lib/form-options";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { NOTIFICATION_STATUS } from "@/server/notifications/service";
import { StatusBadge } from "../../ui";
import { EvaluationPanel, LegacyScore } from "./evaluation-panel";
import { addNoteAction, deleteAction, rateAction, updatePriorityAction, updateStatusAction } from "./actions";

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });

const OK_MESSAGES: Record<string, string> = {
  estado: "Estado actualizado.",
  prioridad: "Prioridad actualizada.",
  calificacion: "Calificación guardada.",
  nota: "Nota agregada.",
  evaluacion: "Evaluación actualizada.",
};

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Postulación recibida",
  STATUS: "Cambio de estado",
  PRIORITY: "Cambio de prioridad",
  RATING: "Calificación humana",
  CV_DOWNLOAD: "Descarga de CV",
  EVAL_RETRY: "Reintento de evaluación",
  EVAL_MANUAL_REVIEW: "Enviada a revisión manual",
  EVAL_CONFIRMED: "Evaluación de IA confirmada por una persona",
  EVAL_MANUAL: "Evaluación manual",
};

export default async function ApplicationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser("applications:view");
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^c[a-z0-9]{20,30}$/.test(id)) notFound();

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      cv: true,
      attribution: true,
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      events: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      notifications: { orderBy: { createdAt: "asc" } },
      evaluations: { include: { reviewedBy: { select: { name: true } } } },
      cycle: { select: { id: true, name: true, status: true } },
    },
  });
  if (!app) notFound();

  // Acceso a datos de contacto: queda registrado en auditoría.
  await audit("VIEW_APPLICATION", { actorId: user.id, targetId: app.id });

  const isV1 = app.questionSetVersion === CHALLENGE_V1_VERSION;
  const evaluation = app.rubricVersion ? (app.evaluations.find((e) => e.rubricVersion === app.rubricVersion) ?? null) : null;
  const answers = app.challengeAnswers as Record<string, string>;
  const waNumber = `52${app.phone}`;

  return (
    <div className="space-y-6">
      <Link href="/admin/postulaciones" className="text-sm font-semibold underline underline-offset-2">
        ← Volver a postulaciones
      </Link>

      {ok && OK_MESSAGES[ok] && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
          {OK_MESSAGES[ok]}
        </p>
      )}
      {error === "confirmacion" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          El código de confirmación no coincide; no se borró el expediente.
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {app.firstName} {app.lastName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <span className="font-mono">{app.code}</span>·<span>Recibida {dateFmt.format(app.createdAt)}</span>·
            <StatusBadge status={app.status} label={statusLabel(app.status)} />
            {app.priority !== 0 && (
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${app.priority > 0 ? "bg-red-100 text-red-800" : "bg-zinc-200"}`}>
                Prioridad {app.priority > 0 ? "alta" : "baja"}
              </span>
            )}
            {app.possibleDuplicate && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Posible duplicado</span>}
            {app.afterClose && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Posterior al cierre</span>}
          </p>
          {app.cycle && (
            <p className="mt-1 text-sm">
              Convocatoria:{" "}
              <Link href={`/admin/convocatorias/${app.cycle.id}`} className="font-semibold underline">
                {app.cycle.name}
              </Link>
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {isV1 ? (
            <LegacyScore app={app} />
          ) : (
            <EvaluationPanel
              applicationId={app.id}
              evaluation={evaluation}
              canManage={can(user.role, "evaluations:manage")}
              vehicleExperience={optionLabel(VEHICLE_EXPERIENCE_OPTIONS, app.vehicleSalesExperience)}
              hasCv={Boolean(app.cv)}
            />
          )}

          {/* ---------- Desafío ---------- */}
          <section className="a-card p-5" aria-labelledby="ch-h">
            <h2 id="ch-h" className="font-bold">
              Desafío de ventas · respuestas
            </h2>
            <p className="text-xs text-zinc-500">Versión de preguntas: {app.questionSetVersion}</p>
            <ol className="mt-3 space-y-4">
              {(isV1 ? CHALLENGE_V1 : CHALLENGE).map((q, idx) => (
                <li key={q.id} className="text-sm">
                  <p className="font-semibold">
                    {idx + 1}. {q.title}
                  </p>
                  <p className="text-zinc-600">{q.prompt}</p>
                  <p className="mt-1 whitespace-pre-line rounded-md bg-zinc-50 p-3">
                    {"options" in q ? (q.options.find((o) => o.id === answers[q.id])?.text ?? "—") : (answers[q.id] ?? "—")}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* ---------- Experiencia e interés ---------- */}
          <section className="a-card p-5" aria-labelledby="exp-h">
            <h2 id="exp-h" className="font-bold">
              Experiencia e interés
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Item label="Productos o servicios que ha vendido" value={app.productsSold} />
              {app.helpedDecideStory && <Item label="Situación en la que ayudó a decidir (desafío v1)" value={app.helpedDecideStory} />}
              <Item label="Seguimiento a clientes" value={optionLabel(FOLLOWUP_OPTIONS, app.followupExperience)} />
              <Item label="Cómo da seguimiento" value={app.followupDetail} />
              <Item label="Años de experiencia" value={optionLabel(YEARS_OPTIONS, app.yearsExperience)} />
              <Item label="Qué le interesa de la vacante" value={app.interestVacancy} />
              <Item label="Temas de interés" value={app.interestTopics.map((t) => optionLabel(INTEREST_TOPIC_OPTIONS, t)).join(", ")} />
              <Item label="Detalle de interés" value={app.interestDetail} />
            </dl>
          </section>

          {/* ---------- Notas ---------- */}
          <section className="a-card p-5" aria-labelledby="notes-h">
            <h2 id="notes-h" className="font-bold">
              Notas internas
            </h2>
            {can(user.role, "applications:note") && (
              <form action={addNoteAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={app.id} />
                <label htmlFor="note" className="sr-only">
                  Nueva nota
                </label>
                <textarea id="note" name="body" required maxLength={2000} rows={3} className="a-input" placeholder="Escribe una nota para el equipo…" />
                <button type="submit" className="a-btn">
                  Agregar nota
                </button>
              </form>
            )}
            {app.notes.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Sin notas.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {app.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                    <p className="whitespace-pre-line">{n.body}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {n.author?.name ?? "Usuario eliminado"} · {dateFmt.format(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- Historial ---------- */}
          <section className="a-card p-5" aria-labelledby="log-h">
            <h2 id="log-h" className="font-bold">
              Registro de cambios
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {app.events.map((e) => (
                <li key={e.id} className="border-l-2 border-zinc-300 pl-3">
                  <p>
                    <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                    {e.type === "STATUS" && `: ${statusLabel(e.fromValue ?? "")} → ${statusLabel(e.toValue ?? "")}`}
                    {e.type === "PRIORITY" &&
                      `: ${PRIORITIES.find((p) => String(p.value) === e.fromValue)?.label} → ${PRIORITIES.find((p) => String(p.value) === e.toValue)?.label}`}
                    {e.type === "RATING" && `: ${e.fromValue ?? "—"} → ${e.toValue}/5`}
                    {(e.type === "EVAL_MANUAL" || e.type === "EVAL_CONFIRMED") && e.toValue && `: ${e.toValue}/100`}
                  </p>
                  {e.reason && <p className="text-zinc-600">Motivo: {e.reason}</p>}
                  <p className="text-xs text-zinc-500">
                    {e.actor?.name ?? (e.type === "CREATED" ? "Sistema" : "Usuario eliminado")} · {dateFmt.format(e.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ================= Columna lateral ================= */}
        <aside className="space-y-6">
          <section className="a-card p-5" aria-labelledby="contact-h">
            <h2 id="contact-h" className="font-bold">
              Contacto
            </h2>
            <p className="mt-1 text-xs text-zinc-500">El acceso a esta ficha queda registrado.</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-zinc-500">Celular / WhatsApp</dt>
                <dd className="flex flex-wrap gap-3">
                  <a href={`tel:+${waNumber}`} className="font-semibold underline">
                    {app.phone.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3")}
                  </a>
                  <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="underline">
                    Abrir WhatsApp
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Correo</dt>
                <dd>{app.email ? <a href={`mailto:${app.email}`} className="underline">{app.email}</a> : "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="a-card p-5" aria-labelledby="pref-h">
            <h2 id="pref-h" className="font-bold">
              Agencias y disponibilidad
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Item label="Primera opción" value={app.agencyFirst ? agencyName(app.agencyFirst) : "—"} />
              <Item label="Segunda opción" value={app.agencySecond ? agencyName(app.agencySecond) : "—"} />
              <Item label="Abierta a cualquier agencia" value={app.anyAgency ? "Sí" : "No"} />
              <Item label="Zona de traslado" value={app.generalArea} />
              <Item label="Puede acudir" value={optionLabel(COMMUTE_OPTIONS, app.canCommute)} />
              <Item label="Entrevista" value={app.interviewAvailability.map((a) => optionLabel(INTERVIEW_AVAILABILITY_OPTIONS, a)).join(", ")} />
              {app.scheduleTalk && <Item label="Conversar horario" value={optionLabel(SCHEDULE_TALK_OPTIONS, app.scheduleTalk)} />}
              {app.scheduleAcknowledged !== null && <Item label="Revisó horario del puesto" value={app.scheduleAcknowledged ? "Sí" : "No"} />}
            </dl>
          </section>

          <section className="a-card p-5" aria-labelledby="cv-h">
            <h2 id="cv-h" className="font-bold">
              CV
            </h2>
            {app.cv ? (
              <div className="mt-2 text-sm">
                <p className="break-all">{app.cv.originalName}</p>
                <p className="text-zinc-500">{Math.max(1, Math.round(app.cv.sizeBytes / 1024))} KB</p>
                {can(user.role, "cv:download") && (
                  <a href={`/admin/cv/${app.id}`} className="a-btn a-btn-light mt-3">
                    Descargar CV
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">No adjuntó CV.</p>
            )}
          </section>

          <section className="a-card space-y-5 p-5" aria-labelledby="review-h">
            <h2 id="review-h" className="font-bold">
              Revisión
            </h2>
            {can(user.role, "applications:rate") && (
              <form action={rateAction} className="space-y-2">
                <input type="hidden" name="id" value={app.id} />
                <fieldset>
                  <legend className="text-sm font-semibold">Calificación humana</legend>
                  <div className="mt-1 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="flex-1">
                        <input type="radio" name="rating" value={n} defaultChecked={app.humanRating === n} required className="peer sr-only" />
                        <span className="block cursor-pointer rounded border border-zinc-300 py-1.5 text-center font-semibold peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-red-600">
                          {n}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label htmlFor="rating-reason" className="sr-only">
                  Comentario de la calificación
                </label>
                <input id="rating-reason" name="reason" maxLength={280} placeholder="Comentario breve (opcional)" className="a-input" />
                <button type="submit" className="a-btn w-full">
                  Guardar calificación
                </button>
              </form>
            )}
            {can(user.role, "applications:status") && (
              <form action={updateStatusAction} className="space-y-2 border-t border-zinc-200 pt-4">
                <input type="hidden" name="id" value={app.id} />
                <label htmlFor="status" className="text-sm font-semibold">
                  Estado del proceso
                </label>
                <select id="status" name="status" defaultValue={app.status} className="a-input">
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="status-reason" className="sr-only">
                  Motivo del cambio
                </label>
                <input id="status-reason" name="reason" maxLength={280} placeholder="Motivo (opcional)" className="a-input" />
                <button type="submit" className="a-btn w-full">
                  Actualizar estado
                </button>
              </form>
            )}
            {can(user.role, "applications:priority") && (
              <form action={updatePriorityAction} className="space-y-2 border-t border-zinc-200 pt-4">
                <input type="hidden" name="id" value={app.id} />
                <label htmlFor="priority" className="text-sm font-semibold">
                  Prioridad manual
                </label>
                <p className="text-xs text-zinc-500">Modifica el orden “Recomendado”. Explica brevemente por qué, si lo cambias.</p>
                <select id="priority" name="priority" defaultValue={String(app.priority)} className="a-input">
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="priority-reason" className="sr-only">
                  Razón de la prioridad
                </label>
                <input id="priority-reason" name="reason" maxLength={280} defaultValue={app.priorityReason ?? ""} placeholder="Razón breve (opcional)" className="a-input" />
                <button type="submit" className="a-btn w-full">
                  Guardar prioridad
                </button>
              </form>
            )}
          </section>

          <section className="a-card p-5" aria-labelledby="notif-h">
            <h2 id="notif-h" className="font-bold">
              Notificación al equipo
            </h2>
            {app.notifications.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                {app.possibleDuplicate ? "No se notificó (posible duplicado)." : "Sin registro de notificación."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {app.notifications.map((n) => (
                  <li key={n.id}>
                    {n.recipientLabel} {n.recipientMasked !== "—" && <span className="text-zinc-500">({n.recipientMasked})</span>}:{" "}
                    <strong>{NOTIFICATION_STATUS[n.status as keyof typeof NOTIFICATION_STATUS] ?? n.status}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="a-card p-5 text-sm" aria-labelledby="meta-h">
            <h2 id="meta-h" className="font-bold">
              Consentimiento y origen
            </h2>
            <dl className="mt-2 space-y-2">
              <Item label="Aviso aceptado" value={`Versión ${app.privacyNoticeVersion} · ${dateFmt.format(app.privacyAcceptedAt)}`} />
              <Item label="Conservar para futuras vacantes" value={app.futureVacanciesConsent ? "Sí, autorizado" : "No"} />
              <Item
                label="Campaña"
                value={
                  app.attribution
                    ? [app.attribution.utmSource, app.attribution.utmMedium, app.attribution.utmCampaign, app.attribution.utmContent]
                        .filter(Boolean)
                        .join(" · ") || app.attribution.referrer
                    : "Directo / sin datos"
                }
              />
            </dl>
          </section>

          {can(user.role, "applications:delete") && (
            <details className="a-card p-5 text-sm">
              <summary className="cursor-pointer font-bold text-red-800">Eliminar expediente (ARCO)</summary>
              <form action={deleteAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={app.id} />
                <p>Borra de forma definitiva los datos, respuestas y CV. No se puede deshacer.</p>
                <label htmlFor="del-reason" className="font-semibold">
                  Motivo (sin datos personales)
                </label>
                <input id="del-reason" name="reason" required minLength={3} maxLength={280} className="a-input" placeholder="Ej.: solicitud ARCO de cancelación" />
                <label htmlFor="del-confirm" className="font-semibold">
                  Escribe el código <span className="font-mono">{app.code}</span> para confirmar
                </label>
                <input id="del-confirm" name="confirm" required className="a-input font-mono" autoComplete="off" />
                <button type="submit" className="a-btn a-btn-red w-full">
                  Eliminar definitivamente
                </button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="whitespace-pre-line break-words">{value || "—"}</dd>
    </div>
  );
}
