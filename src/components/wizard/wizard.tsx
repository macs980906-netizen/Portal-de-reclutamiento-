"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENCIES, UPCOMING_AGENCY_NOTE, agencyName } from "@/config/agencies";
import { BUSINESS } from "@/config/business";
import { CHALLENGE } from "@/lib/challenge";
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
import { STEP_SCHEMAS, applicationSchema, fieldErrors, scheduleConfirmed } from "@/lib/validation";
import { captureAttribution, readAttribution } from "@/lib/attribution";
import { Checkbox, CheckboxCards, RadioCards, SelectField, TextArea, TextField } from "./fields";
import {
  EMPTY_STATE,
  PROGRESS_GROUPS,
  STEPS,
  type FormState,
  type Section,
  type StepId,
  clearPersisted,
  loadPersisted,
  savePersisted,
  stepForErrorPath,
  toPayloadSection,
} from "./state";

const CV_EXTENSIONS = ["pdf", "doc", "docx"];

type Errors = Record<string, string>;

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Respaldo para navegadores antiguos (formato UUID v4).
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16),
  );
}

function prefixed(section: string, errs: Errors): Errors {
  return Object.fromEntries(Object.entries(errs).map(([k, v]) => [`${section}.${k}`, v]));
}

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Initial = { state: FormState; step: StepId; meta: { startedAt: number; submissionKey: string; funnelCounted: boolean } };

function initialFromStorage(): Initial {
  const saved = loadPersisted();
  if (saved) {
    return {
      state: saved.state,
      step: saved.step,
      meta: { startedAt: saved.startedAt, submissionKey: saved.submissionKey, funnelCounted: Boolean(saved.funnelCounted) },
    };
  }
  return { state: EMPTY_STATE, step: "intro", meta: { startedAt: Date.now(), submissionKey: newKey(), funnelCounted: false } };
}

/** Se renderiza sólo en el navegador (ver `wizard-loader.tsx`), por eso puede leer sessionStorage al iniciar. */
export function Wizard({
  privacyVersion,
  aiAssisted,
  cvMaxMb,
}: {
  privacyVersion: string;
  aiAssisted: boolean;
  cvMaxMb: number;
}) {
  const router = useRouter();
  const [initial] = useState(initialFromStorage);
  const [state, setState] = useState<FormState>(initial.state);
  const [step, setStep] = useState<StepId>(initial.step);
  const [errors, setErrors] = useState<Errors>({});
  const [cv, setCv] = useState<File | null>(null);
  const [cvError, setCvError] = useState<string>();
  const [returnToReview, setReturnToReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [honeypot, setHoneypot] = useState("");
  const meta = useRef(initial.meta);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    savePersisted({ state, step, ...meta.current });
  }, [state, step]);

  // Al cambiar de paso: llevar el foco al título (lectores de pantalla y teclado).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [step]);

  const update = useCallback(<S extends Section>(section: S, patch: Partial<FormState[S]>) => {
    setState((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
    setErrors((prev) => {
      const keys = Object.keys(patch).map((k) => `${section}.${k}`);
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  }, []);

  const err = (path: string) => errors[path];

  function validate(current: StepId): Errors {
    if (current === "intro") return {};
    if (current === "contact" || current === "preferences" || current === "experience" || current === "interest") {
      const r = STEP_SCHEMAS[current].safeParse(toPayloadSection(state, current));
      return r.success ? {} : prefixed(current, fieldErrors(r.error));
    }
    if (current.startsWith("q")) {
      const qid = current as keyof FormState["challenge"];
      const r = STEP_SCHEMAS.challenge.shape[qid].safeParse(state.challenge[qid]);
      return r.success ? {} : { [`challenge.${qid}`]: r.error.issues[0]?.message ?? "Revisa tu respuesta." };
    }
    // Revisión: todo el formulario.
    const r = applicationSchema.safeParse(buildPayload());
    return r.success ? {} : fieldErrors(r.error);
  }

  function focusFirstError(errs: Errors) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(first)}"]`);
      const target = el?.matches("input,select,textarea") ? el : el?.querySelector<HTMLElement>("input,select,textarea");
      target?.focus();
    });
  }

  function goTo(next: StepId) {
    setErrors({});
    setSubmitError(undefined);
    setStep(next);
  }

  function countFunnelStart() {
    if (meta.current.funnelCounted) return;
    meta.current.funnelCounted = true;
    fetch("/api/funnel", { method: "POST" }).catch(() => {});
  }

  function next() {
    const errs = validate(step);
    if (Object.keys(errs).length) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    if (step === "intro") countFunnelStart();
    if (returnToReview && step !== "review") {
      setReturnToReview(false);
      goTo("review");
      return;
    }
    const idx = STEPS.indexOf(step);
    goTo(STEPS[Math.min(idx + 1, STEPS.length - 1)]!);
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) goTo(STEPS[idx - 1]!);
  }

  function editFrom(target: StepId) {
    setReturnToReview(true);
    goTo(target);
  }

  function buildPayload() {
    return {
      submissionKey: meta.current.submissionKey,
      contact: toPayloadSection(state, "contact"),
      preferences: toPayloadSection(state, "preferences"),
      experience: toPayloadSection(state, "experience"),
      interest: toPayloadSection(state, "interest"),
      challenge: state.challenge,
      consent: state.consent,
      attribution: readAttribution(),
    };
  }

  function onCvChange(file: File | null) {
    setCvError(undefined);
    if (!file) {
      setCv(null);
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!CV_EXTENSIONS.includes(ext)) {
      setCv(null);
      setCvError("Sólo aceptamos CV en PDF, DOC o DOCX.");
      return;
    }
    if (file.size > cvMaxMb * 1024 * 1024) {
      setCv(null);
      setCvError(`El archivo supera el máximo de ${cvMaxMb} MB.`);
      return;
    }
    setCv(file);
  }

  async function submit() {
    const errs = validate("review");
    if (Object.keys(errs).length) {
      setErrors(errs);
      const firstStep = stepForErrorPath(Object.keys(errs)[0]!);
      if (firstStep !== "review") {
        setReturnToReview(true);
        setStep(firstStep);
      }
      focusFirstError(errs);
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const fd = new FormData();
      fd.set("payload", JSON.stringify(buildPayload()));
      fd.set("startedAt", String(meta.current.startedAt));
      fd.set("website", honeypot);
      if (cv) fd.set("cv", cv);
      const res = await fetch("/api/applications", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string; errors?: Errors };
      if (res.ok && json.ok && json.code) {
        clearPersisted();
        router.replace(`/postular/gracias?codigo=${encodeURIComponent(json.code)}`);
        return;
      }
      if (json.errors?.cv) setCvError(json.errors.cv);
      const fieldErrs = Object.fromEntries(Object.entries(json.errors ?? {}).filter(([k]) => k !== "cv"));
      if (Object.keys(fieldErrs).length) {
        const firstStep = stepForErrorPath(Object.keys(fieldErrs)[0]!);
        setErrors(fieldErrs);
        if (firstStep !== "review") {
          setReturnToReview(true);
          setStep(firstStep);
        }
        focusFirstError(fieldErrs);
      }
      setSubmitError(json.message ?? "No pudimos enviar tu postulación. Intenta de nuevo.");
    } catch {
      setSubmitError("No hay conexión o se interrumpió el envío. Tus respuestas siguen guardadas en este dispositivo; intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    if (!window.confirm("¿Borrar todas tus respuestas de este dispositivo y empezar de nuevo?")) return;
    clearPersisted();
    setState(EMPTY_STATE);
    setCv(null);
    meta.current = { startedAt: Date.now(), submissionKey: newKey(), funnelCounted: meta.current.funnelCounted };
    goTo("intro");
  }

  const errorCount = Object.keys(errors).length;
  const isChallenge = step.startsWith("q");
  const questionIndex = isChallenge ? Number(step.slice(1)) - 1 : -1;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24">
      {step !== "intro" && <Progress step={step} />}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") void submit();
          else next();
        }}
        className="panel mt-6 p-5 sm:p-8"
        aria-labelledby="step-title"
      >
        {/* Campo trampa para bots: invisible y fuera del orden de tabulación. */}
        <div className="honeypot" aria-hidden="true">
          <label>
            No llenar este campo
            <input tabIndex={-1} autoComplete="off" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>
        </div>

        {errorCount > 0 && (
          <div role="alert" className="mb-6 rounded-lg border border-red-hot/70 bg-red/10 p-4 text-white">
            <p className="font-semibold">
              {errorCount === 1 ? "Revisa 1 campo marcado." : `Revisa ${errorCount} campos marcados.`}
            </p>
          </div>
        )}

        {step === "intro" && (
          <div>
            <p className="kicker">Postulación · Asesor/a comercial</p>
            <h1 id="step-title" ref={headingRef} tabIndex={-1} className="display mt-3 text-4xl outline-none sm:text-5xl">
              <span className="text-chrome">Antes de</span> <span className="text-fire">empezar</span>
            </h1>
            <ul className="mt-6 space-y-3 text-lg text-fog">
              <li>
                <span aria-hidden="true">⏱ </span>Te toma <strong className="text-white">{BUSINESS.estimatedMinutes}</strong>.
              </li>
              <li>
                <span aria-hidden="true">📝 </span>Son 6 partes: contacto, agencias, experiencia, interés, un desafío breve de
                ventas y revisión.
              </li>
              <li>
                <span aria-hidden="true">📎 </span>El CV es <strong className="text-white">opcional</strong>.
              </li>
              <li>
                <span aria-hidden="true">↩ </span>Puedes regresar a pasos anteriores sin perder tus respuestas.
              </li>
            </ul>
            <p className="mt-6 rounded-lg border border-line bg-ink/60 p-4 text-fog">
              Tus respuestas se guardan temporalmente sólo en esta pestaña de tu dispositivo hasta que envíes o la cierres. No
              necesitas haber vendido motos: nos interesa cómo atiendes y cómo aprendes.
            </p>
          </div>
        )}

        {step === "contact" && (
          <StepShell title="Tus datos de contacto" headingRef={headingRef} kicker="Paso 1 de 6">
            <p className="text-fog">Los usamos sólo para comunicarnos contigo sobre esta postulación.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="contact.firstName" label="Nombre" autoComplete="given-name" value={state.contact.firstName} onChange={(v) => update("contact", { firstName: v })} error={err("contact.firstName")} maxLength={60} />
              <TextField name="contact.lastName" label="Apellido" autoComplete="family-name" value={state.contact.lastName} onChange={(v) => update("contact", { lastName: v })} error={err("contact.lastName")} maxLength={80} />
            </div>
            <TextField
              name="contact.phone"
              label="Celular / WhatsApp"
              hint="Es el medio principal para contactarte: por llamada o WhatsApp. 10 dígitos."
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="55 1234 5678"
              value={state.contact.phone}
              onChange={(v) => update("contact", { phone: v })}
              error={err("contact.phone")}
              maxLength={20}
            />
            <TextField
              name="contact.email"
              label="Correo electrónico"
              optional
              hint="Útil para enviarte información de la entrevista si continúas en el proceso."
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nombre@correo.com"
              value={state.contact.email}
              onChange={(v) => update("contact", { email: v })}
              error={err("contact.email")}
              maxLength={120}
            />
          </StepShell>
        )}

        {step === "preferences" && (
          <StepShell title="Agencias y disponibilidad" headingRef={headingRef} kicker="Paso 2 de 6">
            <Checkbox
              name="preferences.anyAgency"
              label="Me interesa cualquiera de las agencias"
              hint="Si la marcas, la primera opción se vuelve opcional."
              checked={state.preferences.anyAgency}
              onChange={(v) => update("preferences", { anyAgency: v })}
            />
            <RadioCards
              name="preferences.agencyFirst"
              legend={state.preferences.anyAgency ? "Si tienes una favorita, ¿cuál sería?" : "Primera opción de agencia"}
              optional={state.preferences.anyAgency}
              options={AGENCIES.map((a) => ({ id: a.id, label: a.name, description: a.zone }))}
              value={state.preferences.agencyFirst}
              onChange={(v) =>
                update("preferences", {
                  agencyFirst: v,
                  agencySecond: state.preferences.agencySecond === v ? "" : state.preferences.agencySecond,
                })
              }
              error={err("preferences.agencyFirst")}
              columns={2}
            />
            <SelectField
              name="preferences.agencySecond"
              label="Segunda opción"
              optional
              options={AGENCIES.filter((a) => a.id !== state.preferences.agencyFirst).map((a) => ({ id: a.id, label: a.name }))}
              placeholder="Sin segunda opción"
              value={state.preferences.agencySecond}
              onChange={(v) => update("preferences", { agencySecond: v })}
              error={err("preferences.agencySecond")}
            />
            <p className="text-sm text-mute">
              La asignación final depende de las vacantes y del proceso de selección. {UPCOMING_AGENCY_NOTE}
            </p>
            <TextField
              name="preferences.generalArea"
              label="¿Desde qué zona te trasladarías?"
              optional
              hint="Sólo alcaldía o municipio (por ejemplo, Iztapalapa o Ecatepec). No escribas tu domicilio."
              value={state.preferences.generalArea}
              onChange={(v) => update("preferences", { generalArea: v })}
              error={err("preferences.generalArea")}
              maxLength={80}
            />
            <RadioCards
              name="preferences.canCommute"
              legend="¿Puedes acudir a la agencia que elegiste?"
              options={COMMUTE_OPTIONS}
              value={state.preferences.canCommute}
              onChange={(v) => update("preferences", { canCommute: v })}
              error={err("preferences.canCommute")}
            />
            <CheckboxCards
              name="preferences.interviewAvailability"
              legend="¿Cuándo podrías tener una entrevista?"
              hint="Elige todas las que apliquen."
              options={INTERVIEW_AVAILABILITY_OPTIONS}
              values={state.preferences.interviewAvailability}
              onChange={(v) => update("preferences", { interviewAvailability: v })}
              error={err("preferences.interviewAvailability")}
              columns={2}
            />
            {scheduleConfirmed() ? (
              <Checkbox
                name="preferences.scheduleAcknowledged"
                label={`Revisé el horario del puesto: ${BUSINESS.jobSchedule}`}
                checked={state.preferences.scheduleAcknowledged}
                onChange={(v) => update("preferences", { scheduleAcknowledged: v })}
                error={err("preferences.scheduleAcknowledged")}
              />
            ) : (
              <RadioCards
                name="preferences.scheduleTalk"
                legend="¿Tienes disponibilidad para conversar sobre el horario de la vacante?"
                options={SCHEDULE_TALK_OPTIONS}
                value={state.preferences.scheduleTalk}
                onChange={(v) => update("preferences", { scheduleTalk: v })}
                error={err("preferences.scheduleTalk")}
              />
            )}
          </StepShell>
        )}

        {step === "experience" && (
          <StepShell title="Tu experiencia" headingRef={headingRef} kicker="Paso 3 de 6">
            <p className="text-fog">Cuenta la experiencia de cualquier giro, formal o informal. No buscamos palabras técnicas.</p>
            <TextField
              name="experience.productsSold"
              label="¿Qué tipo de productos o servicios has vendido o ayudado a ofrecer?"
              optional
              placeholder="Ej.: ropa, celulares, seguros, comida, servicios…"
              value={state.experience.productsSold}
              onChange={(v) => update("experience", { productsSold: v })}
              error={err("experience.productsSold")}
              maxLength={300}
            />
            <RadioCards
              name="experience.followupExperience"
              legend="¿Qué experiencia tienes dando seguimiento a clientes?"
              options={FOLLOWUP_OPTIONS}
              value={state.experience.followupExperience}
              onChange={(v) => update("experience", { followupExperience: v })}
              error={err("experience.followupExperience")}
            />
            <TextArea
              name="experience.followupDetail"
              label="Si quieres, cuéntanos cómo lo haces"
              optional
              rows={3}
              value={state.experience.followupDetail}
              onChange={(v) => update("experience", { followupDetail: v })}
              error={err("experience.followupDetail")}
              maxLength={600}
            />
            <SelectField
              name="experience.yearsExperience"
              label="Años de experiencia en ventas o atención a clientes"
              optional
              options={YEARS_OPTIONS}
              value={state.experience.yearsExperience}
              onChange={(v) => update("experience", { yearsExperience: v })}
              error={err("experience.yearsExperience")}
            />
            <RadioCards
              name="experience.vehicleSalesExperience"
              legend="¿Has vendido vehículos antes?"
              hint="No es requisito. Sólo nos ayuda a conocer tu trayectoria."
              optional
              options={VEHICLE_EXPERIENCE_OPTIONS}
              value={state.experience.vehicleSalesExperience}
              onChange={(v) => update("experience", { vehicleSalesExperience: v })}
              columns={2}
            />
            <CvInput cv={cv} error={cvError} onChange={onCvChange} maxMb={cvMaxMb} />
          </StepShell>
        )}

        {step === "interest" && (
          <StepShell title="Tu interés en RiderMex" headingRef={headingRef} kicker="Paso 4 de 6">
            <p className="text-fog">Escribe con tus propias palabras. No calificamos ortografía ni estilo.</p>
            <TextArea
              name="interest.interestVacancy"
              label="¿Qué te interesa de esta vacante?"
              value={state.interest.interestVacancy}
              onChange={(v) => update("interest", { interestVacancy: v })}
              error={err("interest.interestVacancy")}
              maxLength={1000}
            />
            <CheckboxCards
              name="interest.interestTopics"
              legend="¿Qué te interesa de las motocicletas, las ventas o la atención a clientes?"
              hint="Elige todas las que apliquen."
              options={INTEREST_TOPIC_OPTIONS}
              values={state.interest.interestTopics}
              onChange={(v) => update("interest", { interestTopics: v })}
              error={err("interest.interestTopics")}
            />
            <TextArea
              name="interest.interestDetail"
              label="¿Algo más que quieras contarnos sobre eso?"
              optional
              rows={3}
              value={state.interest.interestDetail}
              onChange={(v) => update("interest", { interestDetail: v })}
              error={err("interest.interestDetail")}
              maxLength={600}
            />
          </StepShell>
        )}

        {isChallenge && (
          <ChallengeStep
            index={questionIndex}
            headingRef={headingRef}
            value={state.challenge[step as "q1"]}
            onChange={(v) => update("challenge", { [step]: v } as Partial<FormState["challenge"]>)}
            error={err(`challenge.${step}`)}
          />
        )}

        {step === "review" && (
          <StepShell title="Revisa y envía" headingRef={headingRef} kicker="Paso 6 de 6">
            <p className="text-fog">Revisa tus respuestas. Puedes editar cualquier sección antes de enviar.</p>
            <Review state={state} cv={cv} onEdit={editFrom} />

            <div className="space-y-4 border-t border-line pt-6">
              <Checkbox
                name="consent.privacyAccepted"
                label={
                  <>
                    Leí y acepto el{" "}
                    <Link href="/privacidad" target="_blank" className="text-red-text underline underline-offset-4">
                      aviso de privacidad
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </Link>{" "}
                    para el tratamiento de mis datos en esta postulación.
                  </>
                }
                hint={`Necesario para enviar. Versión del aviso: ${privacyVersion}.`}
                checked={state.consent.privacyAccepted}
                onChange={(v) => update("consent", { privacyAccepted: v })}
                error={err("consent.privacyAccepted")}
              />
              <Checkbox
                name="consent.futureVacancies"
                label="Autorizo que RiderMex conserve mis datos para considerarme en futuras vacantes."
                hint="Opcional. No afecta esta postulación."
                checked={state.consent.futureVacancies}
                onChange={(v) => update("consent", { futureVacancies: v })}
              />
            </div>
            <p className="text-sm text-mute">
              {aiAssisted
                ? "Tus respuestas del desafío se califican con apoyo de un sistema de inteligencia artificial según una rúbrica de trabajo; no se le envían tu nombre, teléfono, correo ni CV. El resultado es orientativo y siempre lo revisa una persona del equipo. "
                : "Tus respuestas del desafío se califican según una rúbrica de trabajo; el resultado es orientativo y siempre lo revisa una persona del equipo. "}
              Al enviar, el equipo RiderMex revisará tu postulación y, si tu perfil coincide con una vacante, te contactará.
              Enviarla no garantiza una entrevista ni una contratación.
            </p>
          </StepShell>
        )}

        {submitError && (
          <div role="alert" className="mt-6 rounded-lg border border-red-hot/70 bg-red/10 p-4 text-white">
            {submitError}
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step !== "intro" ? (
            <button type="button" onClick={back} className="btn btn-ghost" disabled={submitting}>
              ← Anterior
            </button>
          ) : (
            <Link href="/" className="btn btn-ghost">
              Volver
            </Link>
          )}
          {step === "review" ? (
            <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Enviando…" : "Enviar mi postulación"}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              {step === "intro" ? "Comenzar" : returnToReview ? "Guardar y volver a revisión" : step === "q6" ? "Revisar respuestas" : "Continuar →"}
            </button>
          )}
        </div>
      </form>

      {step !== "intro" && (
        <p className="mt-6 text-center text-sm text-mute">
          <button type="button" onClick={resetAll} className="underline underline-offset-4 hover:text-white">
            Borrar mis respuestas de este dispositivo
          </button>
        </p>
      )}
    </div>
  );
}

function StepShell({
  title,
  kicker,
  headingRef,
  children,
}: {
  title: string;
  kicker: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="kicker">{kicker}</p>
      <h1 id="step-title" ref={headingRef} tabIndex={-1} className="display mt-3 text-3xl outline-none sm:text-4xl">
        {title}
      </h1>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

function Progress({ step }: { step: StepId }) {
  const activeGroup = PROGRESS_GROUPS.findIndex((g) => g.steps.includes(step));
  const total = STEPS.length - 1;
  const pct = Math.round((STEPS.indexOf(step) / total) * 100);
  return (
    <nav aria-label="Progreso de la postulación" className="mt-2">
      <div
        className="h-2 overflow-hidden rounded-full bg-steel"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${PROGRESS_GROUPS[activeGroup]?.label}: ${pct}% completado`}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-red-deep to-red-hot shadow-[0_0_12px_rgb(255_45_45/0.7)] transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-3 hidden grid-cols-6 gap-1 text-center text-xs sm:grid">
        {PROGRESS_GROUPS.map((g, i) => (
          <li
            key={g.label}
            aria-current={i === activeGroup ? "step" : undefined}
            className={i === activeGroup ? "font-bold text-white" : i < activeGroup ? "text-fog" : "text-mute"}
          >
            {i < activeGroup ? "✓ " : ""}
            {g.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-fog sm:hidden">
        {PROGRESS_GROUPS[activeGroup]?.label} · {pct}%
      </p>
    </nav>
  );
}

function ChallengeStep({
  index,
  headingRef,
  value,
  onChange,
  error,
}: {
  index: number;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const q = CHALLENGE[index]!;
  return (
    <div>
      <p className="kicker">Desafío de ventas RiderMex · Ejercicio {index + 1} de {CHALLENGE.length}</p>
      {index === 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-line bg-ink/60 p-4 text-fog">
          <p>
            Son 6 situaciones de agencia. Contesta con tus palabras lo que harías tú. No hay cronómetro, no es una prueba
            psicológica y no necesitas saber de mecánica ni conocer el catálogo: RiderMex capacita en producto.
          </p>
          <p className="text-sm text-mute">Toma unos 5 a 7 minutos. No calificamos ortografía, acentos ni estilo formal.</p>
        </div>
      )}
      <h1 id="step-title" ref={headingRef} tabIndex={-1} className="display mt-4 text-3xl outline-none sm:text-4xl">
        {q.title}
      </h1>
      <div className="mt-6">
        <TextArea
          name={`challenge.${q.id}`}
          label={<span className="text-xl leading-snug">{q.prompt}</span>}
          hint={q.hint}
          value={value}
          onChange={onChange}
          error={error}
          maxLength={q.maxLength}
          rows={q.id === "q6" ? 7 : 5}
        />
      </div>
    </div>
  );
}

function CvInput({ cv, error, onChange, maxMb }: { cv: File | null; error?: string; onChange: (f: File | null) => void; maxMb: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div data-field="cv">
      <label htmlFor="cv-input" className="field-label">
        CV <span className="ml-1 text-sm font-normal text-mute">(opcional)</span>
      </label>
      <p id="cv-hint" className="field-hint mt-1">
        PDF, DOC o DOCX de hasta {maxMb} MB. Puedes terminar tu registro sin CV.
      </p>
      <div className="mt-3 rounded-xl border-2 border-dashed border-line p-4">
        <input
          ref={inputRef}
          id="cv-input"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          aria-describedby={`cv-hint${error ? " cv-err" : ""}`}
          aria-invalid={error ? true : undefined}
          className="block w-full text-fog file:mr-4 file:min-h-[44px] file:rounded-md file:border-0 file:bg-steel file:px-4 file:font-semibold file:text-white"
        />
        {cv && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-steel/70 p-3" role="status">
            <p className="text-white">
              <span aria-hidden="true">📎 </span>Recibimos: <strong className="break-all">{cv.name}</strong>{" "}
              <span className="text-mute">({formatBytes(cv.size)})</span>
            </p>
            <button
              type="button"
              className="text-sm underline underline-offset-4"
              onClick={() => {
                onChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Quitar archivo
            </button>
          </div>
        )}
      </div>
      {error && (
        <p id="cv-err" className="field-error mt-2">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

function Review({ state, cv, onEdit }: { state: FormState; cv: File | null; onEdit: (s: StepId) => void }) {
  const { contact: c, preferences: p, experience: x, interest: i, challenge: ch } = state;
  const labels = (opts: readonly { id: string; label: string }[], ids: string[]) =>
    ids.length ? ids.map((id) => optionLabel(opts, id)).join(", ") : "—";

  return (
    <div className="space-y-4">
      <ReviewBlock title="Contacto" onEdit={() => onEdit("contact")}>
        <Row label="Nombre" value={`${c.firstName} ${c.lastName}`} />
        <Row label="Celular / WhatsApp" value={c.phone} />
        <Row label="Correo" value={c.email || "—"} />
      </ReviewBlock>
      <ReviewBlock title="Agencias y disponibilidad" onEdit={() => onEdit("preferences")}>
        <Row label="Primera opción" value={p.agencyFirst ? agencyName(p.agencyFirst) : "—"} />
        <Row label="Segunda opción" value={p.agencySecond ? agencyName(p.agencySecond) : "—"} />
        <Row label="Cualquier agencia" value={p.anyAgency ? "Sí" : "No"} />
        <Row label="Zona de traslado" value={p.generalArea || "—"} />
        <Row label="Puede acudir" value={optionLabel(COMMUTE_OPTIONS, p.canCommute)} />
        <Row label="Entrevista" value={labels(INTERVIEW_AVAILABILITY_OPTIONS, p.interviewAvailability)} />
        {!scheduleConfirmed() && <Row label="Conversar horario" value={optionLabel(SCHEDULE_TALK_OPTIONS, p.scheduleTalk)} />}
      </ReviewBlock>
      <ReviewBlock title="Experiencia" onEdit={() => onEdit("experience")}>
        <Row label="Productos o servicios" value={x.productsSold || "—"} />
        <Row label="Seguimiento" value={optionLabel(FOLLOWUP_OPTIONS, x.followupExperience)} />
        <Row label="Años" value={optionLabel(YEARS_OPTIONS, x.yearsExperience)} />
        <Row label="CV" value={cv ? `${cv.name} (${formatBytes(cv.size)})` : "Sin CV"} />
      </ReviewBlock>
      <ReviewBlock title="Interés" onEdit={() => onEdit("interest")}>
        <Row label="De la vacante" value={i.interestVacancy} />
        <Row label="Te interesa" value={labels(INTEREST_TOPIC_OPTIONS, i.interestTopics)} />
      </ReviewBlock>
      <ReviewBlock title="Desafío de ventas" onEdit={() => onEdit("q1")}>
        {CHALLENGE.map((q, idx) => (
          <Row key={q.id} label={`${idx + 1}. ${q.title}`} value={ch[q.id] || "Sin responder"} />
        ))}
      </ReviewBlock>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-ink/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-xl">{title}</h2>
        <button type="button" onClick={onEdit} className="text-sm font-semibold text-red-text underline underline-offset-4 hover:text-white">
          Editar<span className="sr-only"> {title}</span>
        </button>
      </div>
      <dl className="mt-3 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr]">
      <dt className="text-mute">{label}</dt>
      <dd className="whitespace-pre-line break-words text-white">{value}</dd>
    </div>
  );
}

