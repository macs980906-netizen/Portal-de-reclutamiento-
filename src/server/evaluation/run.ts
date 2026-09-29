import "server-only";
import type { ChallengeAnswers } from "@/lib/challenge";
import { buildSystemPrompt, buildUserContent } from "./prompt";
import { getEvaluator, type Evaluator } from "./provider";
import { redactAnswers } from "./redact";
import { getRubric, CURRENT_RUBRIC_VERSION } from "./rubrics";
import { answerReviewReasons, toPoints, validateAiOutput, weightsOf } from "./scoring";
import type { DimensionResult } from "./types";

export type AnswerEvaluation =
  | {
      status: "COMPLETED" | "NEEDS_REVIEW";
      total: number;
      dimensions: DimensionResult[];
      reviewReasons: string[];
      provider: string;
      model: string;
      rubricVersion: string;
    }
  | { status: "PENDING" | "FAILED"; error: string; rubricVersion: string };

/**
 * Evalúa un conjunto de respuestas sin tocar la base de datos (lo usa el modo Google Sheets).
 * Mismas garantías que el flujo completo: sólo se envían respuestas redactadas, la salida se
 * valida contra el esquema y la evidencia se verifica. Nunca inventa un puntaje: sin proveedor
 * devuelve PENDING y ante un error devuelve FAILED.
 */
export async function evaluateAnswers(
  ref: string,
  answers: ChallengeAnswers,
  person: { firstName?: string; lastName?: string },
  opts: { evaluator?: Evaluator | null; rubricVersion?: string } = {},
): Promise<AnswerEvaluation> {
  const rubricVersion = opts.rubricVersion ?? CURRENT_RUBRIC_VERSION;
  const rubric = getRubric(rubricVersion);

  let evaluator: Evaluator;
  if (opts.evaluator !== undefined) {
    if (!opts.evaluator) return { status: "PENDING", error: "Evaluación con IA no configurada.", rubricVersion };
    evaluator = opts.evaluator;
  } else {
    const s = getEvaluator();
    if (!s.configured) return { status: "PENDING", error: s.reason, rubricVersion };
    evaluator = s.evaluator;
  }

  const redacted = redactAnswers(answers, person);
  const res = await evaluator.evaluate({
    ref,
    system: buildSystemPrompt(rubric),
    user: buildUserContent(ref, redacted),
    rubric,
  });
  if (!res.ok) return { status: "FAILED", error: res.error, rubricVersion };

  const v = validateAiOutput(res.raw, rubric, redacted);
  if (!v.ok) return { status: "FAILED", error: `Salida inválida: ${v.error}`, rubricVersion };

  const { total } = toPoints(v.dimensions, weightsOf(rubric));
  const reviewReasons = [...answerReviewReasons(answers, rubric), ...v.reviewReasons];
  return {
    status: reviewReasons.length ? "NEEDS_REVIEW" : "COMPLETED",
    total,
    dimensions: v.dimensions,
    reviewReasons,
    provider: evaluator.provider,
    model: res.model,
    rubricVersion,
  };
}
