import type { Confidence, DimensionResult, Rubric } from "./types";
import type { ChallengeAnswers } from "@/lib/challenge";

/**
 * Conversión y validación del puntaje (funciones puras y deterministas).
 * El total sólo depende de las calificaciones 0–4 por dimensión y de los pesos
 * congelados de la rúbrica: no intervienen experiencia en motos, CV, años de
 * experiencia, zona ni ningún dato personal.
 */

export type Weights = Record<string, number>;

export function weightsOf(rubric: Rubric): Weights {
  return Object.fromEntries(rubric.dimensions.map((d) => [d.id, d.weight]));
}

export type Breakdown = { id: string; score: number; points: number; max: number }[];

export function toPoints(dims: Pick<DimensionResult, "id" | "score">[], weights: Weights): { breakdown: Breakdown; total: number } {
  const breakdown = Object.entries(weights).map(([id, max]) => {
    const score = dims.find((d) => d.id === id)?.score ?? 0;
    return { id, score, max, points: Math.round((score / 4) * max * 100) / 100 };
  });
  const total = Math.round(breakdown.reduce((s, b) => s + b.points, 0) * 10) / 10;
  return { breakdown, total };
}

export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"«»'‘’`´.,;:¡!¿?()\-–—…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** ¿La evidencia citada aparece en las respuestas? (tolerante a acentos, mayúsculas y puntuación). */
export function evidenceFound(evidence: string, corpus: string): boolean {
  const e = normalizeText(evidence.replace(/\.\.\.|…/g, " "));
  if (!e) return true;
  const c = normalizeText(corpus);
  if (c.includes(e)) return true;
  // Citas con elipsis: cada fragmento debe aparecer.
  const parts = evidence
    .split(/\.\.\.|…|\[\.\.\.\]/)
    .map((p) => normalizeText(p))
    .filter((p) => p.length >= 8);
  return parts.length > 1 && parts.every((p) => c.includes(p));
}

const CONFIDENCE: Confidence[] = ["Bajo", "Medio", "Alto"];

export type RawAiOutput = {
  dimensions: Record<string, unknown>;
  instructions_detected?: unknown;
};

export type ValidatedEvaluation =
  | { ok: true; dimensions: DimensionResult[]; reviewReasons: string[] }
  | { ok: false; error: string };

/**
 * Valida estrictamente la salida del proveedor contra el esquema y la rúbrica, verifica
 * que la evidencia citada exista en las respuestas y decide si requiere revisión humana.
 * Nada se guarda si la salida no cumple el esquema.
 */
export function validateAiOutput(raw: unknown, rubric: Rubric, answers: ChallengeAnswers): ValidatedEvaluation {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Salida vacía o no es un objeto JSON." };
  const out = raw as RawAiOutput;
  if (!out.dimensions || typeof out.dimensions !== "object") return { ok: false, error: "Falta el objeto `dimensions`." };

  const reasons: string[] = [];
  const dimensions: DimensionResult[] = [];
  const corpus = Object.values(answers).join("\n");

  for (const dim of rubric.dimensions) {
    const d = (out.dimensions as Record<string, Record<string, unknown>>)[dim.id];
    if (!d || typeof d !== "object") return { ok: false, error: `Falta la dimensión ${dim.id}.` };
    const score = d.score;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 4) {
      return { ok: false, error: `Puntaje fuera de escala en ${dim.id}.` };
    }
    if (typeof d.evidence !== "string" || typeof d.rationale !== "string" || typeof d.review_reason !== "string") {
      return { ok: false, error: `Campos de texto inválidos en ${dim.id}.` };
    }
    if (typeof d.needs_human_review !== "boolean") return { ok: false, error: `needs_human_review inválido en ${dim.id}.` };
    if (!CONFIDENCE.includes(d.confidence as Confidence)) return { ok: false, error: `Confianza inválida en ${dim.id}.` };

    const result: DimensionResult = {
      id: dim.id,
      score,
      evidence: d.evidence.trim().slice(0, 400),
      rationale: d.rationale.trim().slice(0, 600),
      confidence: d.confidence as Confidence,
      needs_human_review: d.needs_human_review,
      review_reason: d.review_reason.trim().slice(0, 300),
    };
    if (!result.rationale) return { ok: false, error: `Falta la justificación en ${dim.id}.` };

    if (result.needs_human_review) reasons.push(`${dim.label}: ${result.review_reason || "el evaluador pidió revisión humana"}`);
    if (result.confidence === "Bajo") reasons.push(`${dim.label}: confianza baja`);
    if (result.score > 0 && !result.evidence) reasons.push(`${dim.label}: puntaje sin evidencia citada`);
    if (result.evidence && !evidenceFound(result.evidence, corpus)) {
      reasons.push(`${dim.label}: la evidencia citada no aparece textualmente en las respuestas`);
    }
    dimensions.push(result);
  }

  if (out.instructions_detected === true) {
    reasons.push("Las respuestas contienen texto dirigido al evaluador (posibles instrucciones); revisar manualmente");
  }
  return { ok: true, dimensions, reviewReasons: reasons };
}

/** Reglas de revisión que no dependen del proveedor (respuestas vacías o casi vacías). */
export function answerReviewReasons(answers: Partial<ChallengeAnswers>, rubric: Rubric): string[] {
  const reasons: string[] = [];
  for (const [id, text] of Object.entries(answers)) {
    if (wordCount(text ?? "") < rubric.eligibility.minWordsPerAnswer) {
      reasons.push(`Respuesta ${id.toUpperCase()} vacía o demasiado breve para evaluarla`);
    }
  }
  return reasons;
}

/** Elegibilidad neutral y transparente para la shortlist. */
export function eligibility(
  app: { challengeAnswers: unknown; questionSetVersion: string; privacyAcceptedAt: Date | null },
  rubric: Rubric,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!app.privacyAcceptedAt) reasons.push("Sin aceptación del aviso de privacidad");
  if (app.questionSetVersion !== rubric.questionSetVersion) {
    reasons.push("Contestó otra versión del desafío");
  } else {
    const answers = (app.challengeAnswers ?? {}) as Record<string, string>;
    const ids = ["q1", "q2", "q3", "q4", "q5", "q6"];
    const missing = ids.filter((id) => wordCount(answers[id] ?? "") < rubric.eligibility.minWordsPerAnswer);
    if (missing.length) reasons.push(`Respuestas sin contestar: ${missing.map((m) => m.toUpperCase()).join(", ")}`);
  }
  return { eligible: reasons.length === 0, reasons };
}
