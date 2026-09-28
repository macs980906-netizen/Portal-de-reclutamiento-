import "server-only";
import { DIMENSIONS, type DimensionId } from "@/lib/dimensions";
import type { ChallengeAnswers } from "@/lib/challenge";
import { CHOICE_KEY, LEARNING_RULES, OPEN_RULES, SCORING_VERSION, WEIGHTS, type Tone } from "./key";

export type Indicator = { source: string; text: string; tone: Tone };

export type ScoreResult = {
  total: number;
  breakdown: { id: DimensionId; score: number; max: number }[];
  indicators: Indicator[];
  version: string;
};

export type ScoreInput = {
  challenge: ChallengeAnswers;
  interestVacancy: string;
  interestDetail?: string;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Máximo crudo alcanzable por dimensión, derivado de la clave (no se captura a mano). */
function rawMaxima(): Record<DimensionId, number> {
  const max = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0])) as Record<DimensionId, number>;
  for (const options of Object.values(CHOICE_KEY)) {
    const perDim: Partial<Record<DimensionId, number>> = {};
    for (const rule of Object.values(options)) {
      for (const [dim, pts] of Object.entries(rule.points) as [DimensionId, number][]) {
        perDim[dim] = Math.max(perDim[dim] ?? 0, pts);
      }
    }
    for (const [dim, pts] of Object.entries(perDim) as [DimensionId, number][]) max[dim] += pts;
  }
  max[OPEN_RULES.asksQuestion.dimension] += OPEN_RULES.asksQuestion.points;
  max[OPEN_RULES.welcoming.dimension] += OPEN_RULES.welcoming.points;
  max[OPEN_RULES.length.dimension] += OPEN_RULES.length.full;
  max[OPEN_RULES.offersHelp.dimension] += OPEN_RULES.offersHelp.points;
  max[LEARNING_RULES.dimension] += LEARNING_RULES.full;
  return max;
}

/**
 * Calcula el puntaje orientativo. Función pura y determinista: la misma respuesta
 * produce siempre el mismo resultado. No usa IA ni datos personales.
 */
export function scoreApplication(input: ScoreInput): ScoreResult {
  const raw = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0])) as Record<DimensionId, number>;
  const indicators: Indicator[] = [];

  for (const [qid, options] of Object.entries(CHOICE_KEY)) {
    const answer = input.challenge[qid as keyof ChallengeAnswers];
    const rule = options[answer];
    if (!rule) continue;
    for (const [dim, pts] of Object.entries(rule.points) as [DimensionId, number][]) raw[dim] += pts;
    indicators.push({ source: qid, text: rule.indicator, tone: rule.tone });
  }

  // Respuesta abierta (q5)
  const original = input.challenge.q5 ?? "";
  const open = normalize(original);
  const words = wordCount(open);
  const asks = /[?¿]/.test(original);
  if (asks) {
    raw[OPEN_RULES.asksQuestion.dimension] += OPEN_RULES.asksQuestion.points;
    indicators.push({ source: "q5", text: "Invita a la persona a contar qué busca (hace una pregunta).", tone: "positive" });
  }
  if (OPEN_RULES.welcoming.keywords.some((k) => open.includes(k))) {
    raw[OPEN_RULES.welcoming.dimension] += OPEN_RULES.welcoming.points;
    indicators.push({ source: "q5", text: "Recibe de forma cordial y sin presión.", tone: "positive" });
  } else if (asks) {
    raw[OPEN_RULES.welcoming.dimension] += OPEN_RULES.welcoming.fallbackIfQuestion;
  }
  const L = OPEN_RULES.length;
  if (words >= L.minWords && words <= L.maxWords) raw[L.dimension] += L.full;
  else if (words >= L.partialMinWords) raw[L.dimension] += L.partial;
  if (words < L.minWords) {
    indicators.push({ source: "q5", text: "Respuesta abierta muy breve; conviene leerla completa.", tone: "neutral" });
  }
  if (OPEN_RULES.offersHelp.keywords.some((k) => open.includes(k))) {
    raw[OPEN_RULES.offersHelp.dimension] += OPEN_RULES.offersHelp.points;
    indicators.push({ source: "q5", text: "Ofrece orientación o ayuda concreta.", tone: "positive" });
  }

  // Interés expresado con sus propias palabras (Paso D)
  const interestWords = wordCount(`${input.interestVacancy} ${input.interestDetail ?? ""}`);
  raw[LEARNING_RULES.dimension] +=
    interestWords >= LEARNING_RULES.minWords ? LEARNING_RULES.full : LEARNING_RULES.partial;

  const maxima = rawMaxima();
  const breakdown = DIMENSIONS.map((d) => {
    const max = WEIGHTS[d.id];
    const score = maxima[d.id] > 0 ? round1((Math.min(raw[d.id], maxima[d.id]) / maxima[d.id]) * max) : 0;
    return { id: d.id, score, max };
  });
  const total = round1(breakdown.reduce((s, b) => s + b.score, 0));

  return { total, breakdown, indicators, version: SCORING_VERSION };
}
