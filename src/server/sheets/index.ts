import "server-only";
import { agencyName } from "@/config/agencies";
import { CHALLENGE, QUESTION_SET_VERSION } from "@/lib/challenge";
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
import type { ApplicationData } from "@/lib/validation";
import { env } from "../env";
import { applicationCode } from "../crypto";
import type { CvKind } from "../file-validation";
import { getRubric } from "../evaluation/rubrics";
import type { AnswerEvaluation } from "../evaluation/run";

/**
 * Modo simple: cada postulación se escribe como una fila en un Google Sheet a través de un
 * Apps Script publicado como aplicación web (ver `google-apps-script/Code.gs`). El secreto
 * compartido viaja en el cuerpo y sólo vive en variables de entorno del servidor.
 */

export const EVAL_LABEL = {
  COMPLETED: "Evaluada",
  NEEDS_REVIEW: "Revisión manual",
  PENDING: "Pendiente",
  FAILED: "Falló",
} as const;

export function sheetsConfigured(): boolean {
  const e = env();
  return Boolean(e.SHEETS_WEBHOOK_URL && e.SHEETS_WEBHOOK_SECRET);
}

/** Evita que un texto del candidato se interprete como fórmula en la hoja. */
export function sheetSafe(value: string): string {
  const v = value.replace(/\r\n/g, "\n");
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const labels = (opts: readonly { id: string; label: string }[], ids: string[]) =>
  ids.map((id) => optionLabel(opts, id)).join(", ");

function formatPhone(p: string) {
  return `+52 ${p.slice(0, 2)} ${p.slice(2, 6)} ${p.slice(6)}`;
}

export type RowMeta = { code: string; receivedAt: Date; aiNotice: boolean; privacyVersion: string };

/** Fila con encabezados legibles; el Apps Script crea las columnas que falten. */
export function buildRow(d: ApplicationData, meta: RowMeta): Record<string, string> {
  const { contact: c, preferences: p, experience: x, interest: i, challenge: ch, consent, attribution: a } = d;
  const row: Record<string, string> = {
    Código: meta.code,
    Fecha: meta.receivedAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }),
    Nombre: c.firstName,
    Apellido: c.lastName,
    WhatsApp: formatPhone(c.phone),
    "Abrir WhatsApp": `https://wa.me/52${c.phone}`,
    Correo: c.email ?? "",
    "Agencia 1": p.agencyFirst ? agencyName(p.agencyFirst) : p.anyAgency ? "Cualquiera" : "",
    "Agencia 2": p.agencySecond ? agencyName(p.agencySecond) : "",
    "Cualquier agencia": p.anyAgency ? "Sí" : "No",
    "Zona de traslado": p.generalArea ?? "",
    "Puede acudir": optionLabel(COMMUTE_OPTIONS, p.canCommute),
    "Disponibilidad entrevista": labels(INTERVIEW_AVAILABILITY_OPTIONS, p.interviewAvailability),
    "Conversar horario": p.scheduleTalk ? optionLabel(SCHEDULE_TALK_OPTIONS, p.scheduleTalk) : "",
    "Productos que ha vendido": x.productsSold ?? "",
    "Seguimiento a clientes": optionLabel(FOLLOWUP_OPTIONS, x.followupExperience),
    "Cómo da seguimiento": x.followupDetail ?? "",
    "Años de experiencia": x.yearsExperience ? optionLabel(YEARS_OPTIONS, x.yearsExperience) : "",
    "Vendió vehículos (no suma)": x.vehicleSalesExperience ? optionLabel(VEHICLE_EXPERIENCE_OPTIONS, x.vehicleSalesExperience) : "",
    "Interés en la vacante": i.interestVacancy,
    "Temas de interés": labels(INTEREST_TOPIC_OPTIONS, i.interestTopics),
    "Detalle de interés": i.interestDetail ?? "",
  };
  for (const [n, q] of CHALLENGE.entries()) row[`P${n + 1} ${q.title}`] = ch[q.id];
  Object.assign(row, {
    CV: "",
    "Estado evaluación": EVAL_LABEL.PENDING,
    Puntaje: "",
    "Futuras vacantes": consent.futureVacancies ? "Sí autoriza" : "No",
    "Aviso aceptado": `${meta.privacyVersion} · ${meta.receivedAt.toISOString()}`,
    "Informado de evaluación con IA": meta.aiNotice ? "Sí" : "No",
    "Versión desafío": QUESTION_SET_VERSION,
    Origen: [a?.utm_source, a?.utm_medium, a?.utm_campaign, a?.utm_content].filter(Boolean).join(" · ") || a?.referrer || "",
    "Estado del proceso": "Nuevo",
    "Notas del equipo": "",
  });
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, sheetSafe(v)]));
}

/** Columnas que se actualizan al terminar (o reintentar) la evaluación. */
export function evaluationFields(result: AnswerEvaluation): Record<string, string> {
  const rubric = getRubric(result.rubricVersion);
  const base: Record<string, string> = {
    "Estado evaluación": EVAL_LABEL[result.status],
    Rúbrica: result.rubricVersion,
    "Evaluado el": new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" }),
  };
  if ("error" in result) {
    return { ...base, Puntaje: "", "Motivos de revisión": sheetSafe(result.error) };
  }
  const fields: Record<string, string> = {
    ...base,
    Puntaje: String(result.total),
    Modelo: `${result.provider} · ${result.model}`,
    "Motivos de revisión": sheetSafe(result.reviewReasons.join(" · ")),
  };
  const summary: string[] = [];
  for (const d of rubric.dimensions) {
    const r = result.dimensions.find((x) => x.id === d.id);
    const pts = r ? Math.round((r.score / 4) * d.weight * 10) / 10 : 0;
    fields[`${d.label} (${d.weight})`] = String(pts);
    if (r) {
      summary.push(`${d.label}: ${r.score}/4 (confianza ${r.confidence}). ${r.evidence ? `“${r.evidence}” — ` : ""}${r.rationale}`);
    }
  }
  fields["Evidencia y justificación"] = sheetSafe(summary.join("\n"));
  return fields;
}

type SheetResponse = { ok: boolean; code?: string; error?: string; duplicateSubmission?: boolean };

export async function postToSheet(payload: Record<string, unknown>): Promise<SheetResponse> {
  const e = env();
  if (!e.SHEETS_WEBHOOK_URL || !e.SHEETS_WEBHOOK_SECRET) return { ok: false, error: "Google Sheets no configurado." };
  try {
    const res = await fetch(e.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: e.SHEETS_WEBHOOK_SECRET }),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as SheetResponse;
    } catch {
      return { ok: false, error: `Respuesta no válida de Apps Script (HTTP ${res.status}).` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.name : "Error de red" };
  }
}

export type SheetCv = { bytes: Uint8Array; kind: CvKind };

export async function appendApplication(d: ApplicationData, cv: SheetCv | null, opts: { aiNotice: boolean; privacyVersion: string }) {
  const code = applicationCode();
  const row = buildRow(d, { code, receivedAt: new Date(), aiNotice: opts.aiNotice, privacyVersion: opts.privacyVersion });
  const res = await postToSheet({
    action: "append",
    submissionKey: d.submissionKey,
    row,
    cv: cv ? { name: `CV-${code}.${cv.kind.ext}`, mimeType: cv.kind.mime, base64: Buffer.from(cv.bytes).toString("base64") } : null,
  });
  if (!res.ok || !res.code) throw new Error(res.error ?? "No se pudo guardar en Google Sheets");
  return { code: res.code, duplicateSubmission: Boolean(res.duplicateSubmission) };
}

export async function writeEvaluation(code: string, result: AnswerEvaluation) {
  return postToSheet({ action: "evaluation", code, fields: evaluationFields(result) });
}
