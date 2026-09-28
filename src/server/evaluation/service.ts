import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { sha256 } from "../crypto";
import { logEvent } from "../audit";
import type { ChallengeAnswers } from "@/lib/challenge";
import { getRubric, hasRubric } from "./rubrics";
import { buildSystemPrompt, buildUserContent } from "./prompt";
import { getEvaluator, type Evaluator } from "./provider";
import { redactAnswers } from "./redact";
import { answerReviewReasons, toPoints, validateAiOutput, weightsOf } from "./scoring";
import type { DimensionResult } from "./types";

export const EVAL_STATUS = {
  PENDING: "Pendiente",
  RUNNING: "En proceso",
  COMPLETED: "Finalizada",
  NEEDS_REVIEW: "Revisión manual",
  FAILED: "Falló",
} as const;

export type EvalStatus = keyof typeof EVAL_STATUS;

const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MS = 15 * 60_000;

type EvaluatorOption = { evaluator?: Evaluator | null };

async function ensureRow(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, rubricVersion: true, questionSetVersion: true },
  });
  if (!app?.rubricVersion || !hasRubric(app.rubricVersion)) return null;
  const row = await prisma.evaluation.upsert({
    where: { applicationId_rubricVersion: { applicationId, rubricVersion: app.rubricVersion } },
    create: { applicationId, rubricVersion: app.rubricVersion, questionSetVersion: app.questionSetVersion, status: "PENDING" },
    update: {},
  });
  return row;
}

async function setApplicationScore(applicationId: string, total: number | null) {
  await prisma.application.update({ where: { id: applicationId }, data: { scoreTotal: total } });
}

/**
 * Evalúa (o reintenta) una postulación. Nunca lanza ni inventa un puntaje: si no hay
 * proveedor configurado la evaluación queda "Pendiente" con el motivo visible; si el
 * proveedor falla queda "Falló" (reintentable) o "Revisión manual".
 */
export async function evaluateApplication(applicationId: string, opts: EvaluatorOption = {}): Promise<EvalStatus | null> {
  try {
    const row = await ensureRow(applicationId);
    if (!row) return null;
    if (row.status !== "PENDING" && row.status !== "FAILED") return row.status as EvalStatus;
    if (row.attempts >= MAX_ATTEMPTS && row.status === "FAILED") return "FAILED";

    const rubric = getRubric(row.rubricVersion);
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { firstName: true, lastName: true, challengeAnswers: true, questionSetVersion: true },
    });
    if (app.questionSetVersion !== rubric.questionSetVersion) {
      await prisma.evaluation.update({
        where: { id: row.id },
        data: { status: "NEEDS_REVIEW", needsReview: true, reviewReasons: ["Contestó otra versión del desafío; evaluar manualmente."] },
      });
      return "NEEDS_REVIEW";
    }

    let evaluator: Evaluator;
    if (opts.evaluator !== undefined) {
      if (!opts.evaluator) return "PENDING";
      evaluator = opts.evaluator;
    } else {
      const status = getEvaluator();
      if (!status.configured) {
        await prisma.evaluation.update({ where: { id: row.id }, data: { lastError: status.reason } });
        return "PENDING";
      }
      evaluator = status.evaluator;
    }

    // Reclamo atómico: evita que dos procesos evalúen la misma fila a la vez.
    const claimed = await prisma.evaluation.updateMany({
      where: { id: row.id, status: row.status, attempts: row.attempts },
      data: { status: "RUNNING", attempts: { increment: 1 }, provider: evaluator.provider, model: evaluator.model },
    });
    if (claimed.count === 0) return null;

    const original = app.challengeAnswers as ChallengeAnswers;
    const redacted = redactAnswers(original, { firstName: app.firstName, lastName: app.lastName });
    const system = buildSystemPrompt(rubric);
    const user = buildUserContent(`EV-${row.id.slice(-10)}`, redacted);
    const inputDigest = sha256(`${system}\n${user}`);

    const res = await evaluator.evaluate({ ref: row.id, system, user, rubric });
    if (!res.ok) {
      await prisma.evaluation.update({
        where: { id: row.id },
        data: {
          status: res.retryable ? "FAILED" : "NEEDS_REVIEW",
          needsReview: !res.retryable,
          reviewReasons: res.retryable ? undefined : [res.error],
          lastError: res.error,
          inputDigest,
        },
      });
      return res.retryable ? "FAILED" : "NEEDS_REVIEW";
    }

    const validated = validateAiOutput(res.raw, rubric, redacted);
    if (!validated.ok) {
      await prisma.evaluation.update({
        where: { id: row.id },
        data: { status: "FAILED", lastError: `Salida inválida: ${validated.error}`, inputDigest, model: res.model },
      });
      return "FAILED";
    }

    const weights = weightsOf(rubric);
    const { total } = toPoints(validated.dimensions, weights);
    const reasons = [...answerReviewReasons(original, rubric), ...validated.reviewReasons];
    const status: EvalStatus = reasons.length ? "NEEDS_REVIEW" : "COMPLETED";
    await prisma.evaluation.update({
      where: { id: row.id },
      data: {
        status,
        source: "AI",
        model: res.model,
        dimensions: validated.dimensions,
        weights,
        total,
        needsReview: reasons.length > 0,
        reviewReasons: reasons,
        lastError: null,
        inputDigest,
        completedAt: new Date(),
      },
    });
    await setApplicationScore(applicationId, status === "COMPLETED" ? total : null);
    return status;
  } catch (err) {
    // Sin datos de la postulación en el log.
    console.error("[evaluación] error", err instanceof Error ? err.name : "desconocido");
    await prisma.evaluation
      .updateMany({
        where: { applicationId, status: "RUNNING" },
        data: { status: "FAILED", lastError: "Error interno al evaluar; reintentar." },
      })
      .catch(() => {});
    return "FAILED";
  }
}

/** Evalúa todas las pendientes o fallidas (de una convocatoria o de todas). */
export async function processPendingEvaluations(opts: EvaluatorOption & { cycleId?: string; limit?: number } = {}) {
  await prisma.evaluation.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    data: { status: "FAILED", lastError: "Evaluación interrumpida; se reintentará." },
  });
  // Postulaciones con rúbrica asignada pero sin fila de evaluación.
  const missing = await prisma.application.findMany({
    where: { rubricVersion: { not: null }, evaluations: { none: {} }, cycleId: opts.cycleId },
    select: { id: true },
    take: opts.limit ?? 200,
  });
  for (const m of missing) await ensureRow(m.id);

  const rows = await prisma.evaluation.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      application: opts.cycleId ? { cycleId: opts.cycleId } : undefined,
    },
    select: { applicationId: true },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 200,
  });
  const results: Record<string, number> = {};
  for (const r of rows) {
    const s = (await evaluateApplication(r.applicationId, opts)) ?? "SKIPPED";
    results[s] = (results[s] ?? 0) + 1;
  }
  return { processed: rows.length, results };
}

/** Acción explícita "Reintentar": vuelve a poner en cola una evaluación fallida o sin resultado. */
export async function requeueEvaluation(applicationId: string, actorId: string | null, opts: EvaluatorOption = {}) {
  const row = await ensureRow(applicationId);
  if (!row) return null;
  if (row.status === "COMPLETED" || row.status === "RUNNING") return row.status as EvalStatus;
  if (row.status === "NEEDS_REVIEW" && row.dimensions) return "NEEDS_REVIEW";
  await prisma.evaluation.update({
    where: { id: row.id },
    data: { status: "PENDING", attempts: 0, needsReview: false, reviewReasons: [] },
  });
  await logEvent(applicationId, actorId, "EVAL_RETRY");
  return evaluateApplication(applicationId, opts);
}

/** Envía la evaluación a revisión manual (desbloquea el cierre, pero la excluye del ranking automático). */
export async function sendToManualReview(applicationId: string, actorId: string, reason: string) {
  const row = await ensureRow(applicationId);
  // Idempotente: si ya está en revisión manual (o evaluándose) no se duplica nada.
  if (!row || row.status === "NEEDS_REVIEW" || row.status === "RUNNING") return;
  const prev = Array.isArray(row.reviewReasons) ? (row.reviewReasons as string[]) : [];
  await prisma.evaluation.update({
    where: { id: row.id },
    data: { status: "NEEDS_REVIEW", needsReview: true, reviewReasons: [...prev, `Enviada a revisión manual: ${reason}`] },
  });
  await setApplicationScore(applicationId, null);
  await logEvent(applicationId, actorId, "EVAL_MANUAL_REVIEW", { from: row.status, to: "NEEDS_REVIEW", reason });
}

/** Una persona confirma el resultado de la IA tras revisarlo (p. ej. confianza baja). */
export async function confirmAiEvaluation(applicationId: string, actorId: string, note?: string) {
  const row = await ensureRow(applicationId);
  if (!row || row.status !== "NEEDS_REVIEW" || !row.dimensions || row.total === null) return false;
  await prisma.evaluation.update({
    where: { id: row.id },
    data: { status: "COMPLETED", needsReview: false, reviewedById: actorId, reviewedAt: new Date() },
  });
  await setApplicationScore(applicationId, row.total);
  await logEvent(applicationId, actorId, "EVAL_CONFIRMED", { to: String(row.total), reason: note });
  return true;
}

export type ManualDimension = { id: string; score: number; rationale: string; evidence?: string };

/** Evaluación manual completa (sustituye a la IA; se conserva el resultado previo de la IA). */
export async function saveManualEvaluation(applicationId: string, actorId: string, dims: ManualDimension[]) {
  const row = await ensureRow(applicationId);
  if (!row) throw new Error("La postulación no tiene rúbrica asignada.");
  const rubric = getRubric(row.rubricVersion);
  const results: DimensionResult[] = rubric.dimensions.map((d) => {
    const m = dims.find((x) => x.id === d.id);
    if (!m || !Number.isInteger(m.score) || m.score < 0 || m.score > 4 || !m.rationale.trim()) {
      throw new Error(`Falta calificación o justificación en: ${d.label}`);
    }
    return {
      id: d.id,
      score: m.score,
      evidence: (m.evidence ?? "").trim().slice(0, 400),
      rationale: m.rationale.trim().slice(0, 600),
      confidence: "Alto",
      needs_human_review: false,
      review_reason: "",
    };
  });
  const weights = weightsOf(rubric);
  const { total } = toPoints(results, weights);
  await prisma.evaluation.update({
    where: { id: row.id },
    data: {
      status: "COMPLETED",
      source: "MANUAL",
      aiDimensions: row.source === "AI" && row.dimensions ? (row.dimensions as Prisma.InputJsonValue) : undefined,
      dimensions: results,
      weights,
      total,
      needsReview: false,
      reviewedById: actorId,
      reviewedAt: new Date(),
      completedAt: new Date(),
      lastError: null,
    },
  });
  await setApplicationScore(applicationId, total);
  await logEvent(applicationId, actorId, "EVAL_MANUAL", { from: row.total?.toString() ?? null, to: String(total) });
  return total;
}
