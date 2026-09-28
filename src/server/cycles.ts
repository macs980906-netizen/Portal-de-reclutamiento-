import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { audit, logEvent } from "./audit";
import { CURRENT_RUBRIC_VERSION, getRubric } from "./evaluation/rubrics";
import { eligibility } from "./evaluation/scoring";
import { computeShortlist, type Candidate, type CandidateEvalStatus, type ShortlistComputation } from "./evaluation/shortlist";
import { processPendingEvaluations } from "./evaluation/service";
import type { Evaluator } from "./evaluation/provider";
import { createNotifications } from "./notifications/service";
import { shortlistPayload } from "./notifications/message";

export const CYCLE_STATUS = { OPEN: "Abierta", REVIEW: "En revisión", CLOSED: "Cerrada" } as const;
export type CycleStatus = keyof typeof CYCLE_STATUS;

export const DEFAULT_TARGET = 5;
/** Umbral inicial sugerido: parámetro por validar con RiderMex, no un estándar científico. */
export const DEFAULT_THRESHOLD = 70;

export type ShortlistSnapshot = ShortlistComputation & {
  version: number;
  computedAt: string;
  rubricVersion: string;
  eligibilityVersion: string;
  totalApplications: number;
  lateCount: number;
};

export class CycleError extends Error {}

/** Convocatoria que recibe una postulación nueva y si llega después del cierre/fecha límite. */
export async function cycleForSubmission(now = new Date()) {
  const cycle = await prisma.recruitmentCycle.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, endsAt: true, rubricVersion: true },
  });
  if (!cycle) return { cycleId: null, afterClose: false, rubricVersion: CURRENT_RUBRIC_VERSION };
  const late = cycle.status !== "OPEN" || Boolean(cycle.endsAt && cycle.endsAt < now);
  return { cycleId: cycle.id, afterClose: late, rubricVersion: cycle.rubricVersion };
}

export async function createCycle(
  actorId: string,
  input: { name: string; startsAt: Date; endsAt?: Date | null; targetCount: number; threshold: number; includeUnassigned: boolean },
) {
  const open = await prisma.recruitmentCycle.findFirst({ where: { status: { in: ["OPEN", "REVIEW"] } }, select: { name: true } });
  if (open) throw new CycleError(`Ya hay una convocatoria activa (“${open.name}”). Ciérrala antes de abrir otra.`);
  const rubric = getRubric(CURRENT_RUBRIC_VERSION);
  const cycle = await prisma.recruitmentCycle.create({
    data: {
      name: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      targetCount: input.targetCount,
      threshold: input.threshold,
      rubricVersion: rubric.version,
      eligibilityVersion: rubric.eligibility.version,
      createdById: actorId,
    },
  });
  if (input.includeUnassigned) {
    await prisma.application.updateMany({
      where: { cycleId: null, questionSetVersion: rubric.questionSetVersion },
      data: { cycleId: cycle.id, rubricVersion: rubric.version, afterClose: false },
    });
  }
  await audit("CYCLE_CREATED", { actorId, targetId: cycle.id, meta: { ...input, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt?.toISOString() ?? null, rubricVersion: rubric.version } });
  return cycle;
}

export async function updateCycleSettings(
  actorId: string,
  cycleId: string,
  input: { name: string; endsAt: Date | null; targetCount: number; threshold: number },
) {
  const cycle = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId } });
  if (cycle.status === "CLOSED") throw new CycleError("La convocatoria está cerrada; abre una nueva versión para cambiar parámetros.");
  await prisma.recruitmentCycle.update({ where: { id: cycleId }, data: input });
  await audit("CYCLE_SETTINGS", {
    actorId,
    targetId: cycleId,
    meta: {
      before: { targetCount: cycle.targetCount, threshold: cycle.threshold, endsAt: cycle.endsAt?.toISOString() ?? null },
      after: { targetCount: input.targetCount, threshold: input.threshold, endsAt: input.endsAt?.toISOString() ?? null },
    },
  });
}

export async function setCycleReview(actorId: string, cycleId: string, review: boolean) {
  const res = await prisma.recruitmentCycle.updateMany({
    where: { id: cycleId, status: review ? "OPEN" : "REVIEW" },
    data: { status: review ? "REVIEW" : "OPEN" },
  });
  if (res.count) await audit(review ? "CYCLE_REVIEW" : "CYCLE_REOPENED", { actorId, targetId: cycleId });
}

type AppForRanking = {
  id: string;
  code: string;
  challengeAnswers: Prisma.JsonValue;
  questionSetVersion: string;
  privacyAcceptedAt: Date;
  afterClose: boolean;
  evaluations: { rubricVersion: string; status: string; total: number | null; reviewReasons: Prisma.JsonValue }[];
};

export function candidatesFor(apps: AppForRanking[], rubricVersion: string): Candidate[] {
  const rubric = getRubric(rubricVersion);
  return apps
    .filter((a) => !a.afterClose)
    .map((a) => {
      const ev = a.evaluations.find((e) => e.rubricVersion === rubricVersion);
      const elig = eligibility(a, rubric);
      return {
        applicationId: a.id,
        code: a.code,
        eligible: elig.eligible,
        ineligibleReasons: elig.reasons,
        evalStatus: (ev?.status ?? "MISSING") as CandidateEvalStatus,
        total: ev?.status === "COMPLETED" ? ev.total : null,
        reviewReasons: Array.isArray(ev?.reviewReasons) ? (ev!.reviewReasons as string[]) : [],
      };
    });
}

async function loadApps(cycleId: string, rubricVersion: string) {
  return prisma.application.findMany({
    where: { cycleId },
    select: {
      id: true,
      code: true,
      challengeAnswers: true,
      questionSetVersion: true,
      privacyAcceptedAt: true,
      afterClose: true,
      evaluations: { where: { rubricVersion }, select: { rubricVersion: true, status: true, total: true, reviewReasons: true } },
    },
  });
}

/** Ranking provisional (convocatoria abierta) o recálculo con los parámetros actuales. */
export async function computeCycleShortlist(cycleId: string) {
  const cycle = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId } });
  const apps = await loadApps(cycleId, cycle.rubricVersion);
  const computation = computeShortlist(candidatesFor(apps, cycle.rubricVersion), cycle.targetCount, cycle.threshold);
  return { cycle, computation, total: apps.filter((a) => !a.afterClose).length, lateCount: apps.filter((a) => a.afterClose).length };
}

export type CloseResult =
  | { ok: true; snapshot: ShortlistSnapshot }
  | { ok: false; reason: "blocked"; blocked: ShortlistComputation["blocked"] }
  | { ok: false; reason: "state"; message: string };

/**
 * "Cerrar y calcular shortlist":
 * 1) reintenta evaluaciones pendientes/fallidas; 2) si alguna sigue sin finalizar, detiene el
 * cierre y devuelve la lista; 3) calcula la shortlist; 4) guarda la instantánea y la versión de
 * rúbrica; 5) cambia a Cerrada (actualización condicional: un solo cierre); 6) envía un aviso
 * por destinatario (idempotente); 7) deja registro auditable.
 */
export async function closeCycle(cycleId: string, actorId: string, opts: { evaluator?: Evaluator | null } = {}): Promise<CloseResult> {
  const cycle = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId } });
  if (cycle.status === "CLOSED") return { ok: false, reason: "state", message: "La convocatoria ya está cerrada." };

  await processPendingEvaluations({ cycleId, evaluator: opts.evaluator });
  const { computation, total, lateCount } = await computeCycleShortlist(cycleId);
  if (computation.blocked.length) {
    await audit("CYCLE_CLOSE_BLOCKED", { actorId, targetId: cycleId, meta: { blocked: computation.blocked.length } });
    return { ok: false, reason: "blocked", blocked: computation.blocked };
  }

  const rubric = getRubric(cycle.rubricVersion);
  const snapshot: ShortlistSnapshot = {
    ...computation,
    version: cycle.shortlistVersion + 1,
    computedAt: new Date().toISOString(),
    rubricVersion: rubric.version,
    eligibilityVersion: rubric.eligibility.version,
    totalApplications: total,
    lateCount,
  };
  const closed = await prisma.recruitmentCycle.updateMany({
    where: { id: cycleId, status: { in: ["OPEN", "REVIEW"] } },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedById: actorId,
      shortlist: snapshot as unknown as Prisma.InputJsonValue,
      shortlistVersion: snapshot.version,
    },
  });
  if (closed.count === 0) return { ok: false, reason: "state", message: "Otra persona cerró la convocatoria al mismo tiempo." };

  await sendShortlistNotice(cycleId, snapshot, 0);
  const notes = await prisma.notification.groupBy({ by: ["status"], where: { cycleId, kind: "SHORTLIST" }, _count: { _all: true } });
  await audit("CYCLE_CLOSED", {
    actorId,
    targetId: cycleId,
    meta: {
      rubricVersion: snapshot.rubricVersion,
      shortlistVersion: snapshot.version,
      recommended: snapshot.recommended.length,
      tie: Boolean(snapshot.tie),
      manualReview: snapshot.manualReview.length,
      notifications: Object.fromEntries(notes.map((n) => [n.status, n._count._all])),
    },
  });
  return { ok: true, snapshot };
}

async function sendShortlistNotice(cycleId: string, snapshot: ShortlistSnapshot, seq: number) {
  const cycle = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId }, select: { name: true } });
  const payload = shortlistPayload({
    cycleId,
    cycleName: cycle.name,
    recommended: snapshot.recommended.length,
    tie: Boolean(snapshot.tie),
    manualReview: snapshot.manualReview.length,
    appUrl: env().APP_URL,
  });
  await createNotifications(`shortlist:${cycleId}:v${snapshot.version}:s${seq}`, payload, { cycleId });
}

/**
 * "Reenviar aviso": sólo avanza si `expectedSeq` coincide (un doble clic o dos personas a la
 * vez no generan dos reenvíos). Queda auditado.
 */
export async function resendShortlistNotice(cycleId: string, actorId: string, expectedSeq: number) {
  const cycle = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId } });
  if (cycle.status !== "CLOSED" || !cycle.shortlist) throw new CycleError("Sólo se reenvía el aviso de una convocatoria cerrada.");
  const bumped = await prisma.recruitmentCycle.updateMany({
    where: { id: cycleId, noticeSeq: expectedSeq },
    data: { noticeSeq: { increment: 1 } },
  });
  if (bumped.count === 0) return false;
  await sendShortlistNotice(cycleId, cycle.shortlist as unknown as ShortlistSnapshot, expectedSeq + 1);
  await audit("SHORTLIST_NOTICE_RESENT", { actorId, targetId: cycleId, meta: { seq: expectedSeq + 1 } });
  return true;
}

/**
 * Nueva versión de una convocatoria cerrada: misma rúbrica y parámetros; recibe las
 * postulaciones que llegaron después del cierre. La shortlist cerrada no se modifica.
 */
export async function openNewVersion(cycleId: string, actorId: string) {
  const parent = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId } });
  if (parent.status !== "CLOSED") throw new CycleError("Sólo se puede versionar una convocatoria cerrada.");
  const active = await prisma.recruitmentCycle.findFirst({ where: { status: { in: ["OPEN", "REVIEW"] } }, select: { name: true } });
  if (active) throw new CycleError(`Ya hay una convocatoria activa (“${active.name}”).`);
  const siblings = await prisma.recruitmentCycle.count({ where: { OR: [{ id: cycleId }, { parentId: cycleId }] } });
  const child = await prisma.recruitmentCycle.create({
    data: {
      name: `${parent.name} (versión ${siblings + 1})`,
      startsAt: new Date(),
      targetCount: parent.targetCount,
      threshold: parent.threshold,
      rubricVersion: parent.rubricVersion,
      eligibilityVersion: parent.eligibilityVersion,
      parentId: parent.id,
      createdById: actorId,
    },
  });
  const moved = await prisma.application.updateMany({
    where: { cycleId, afterClose: true },
    data: { cycleId: child.id, afterClose: false },
  });
  await audit("CYCLE_NEW_VERSION", { actorId, targetId: child.id, meta: { parentId: parent.id, movedApplications: moved.count } });
  return child;
}

/** Marca como "No continúa en esta ronda" a quienes no quedaron recomendados (sólo con confirmación). */
export async function markNotSelected(cycleId: string, actorId: string) {
  const cycle = await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycleId } });
  const snap = cycle.shortlist as unknown as ShortlistSnapshot | null;
  if (cycle.status !== "CLOSED" || !snap) throw new CycleError("Primero cierra la convocatoria.");
  const keep = new Set([...snap.recommended.map((r) => r.applicationId), ...snap.manualReview.map((m) => m.applicationId)]);
  const targets = await prisma.application.findMany({
    where: { cycleId, afterClose: false, status: { in: ["NUEVO", "EN_REVISION"] }, id: { notIn: [...keep] } },
    select: { id: true, status: true },
  });
  for (const t of targets) {
    await prisma.application.update({ where: { id: t.id }, data: { status: "NO_SELECCIONADA" } });
    await logEvent(t.id, actorId, "STATUS", { from: t.status, to: "NO_SELECCIONADA", reason: "Confirmado al cerrar la convocatoria" });
  }
  await audit("CYCLE_MARK_NOT_SELECTED", { actorId, targetId: cycleId, meta: { count: targets.length } });
  return targets.length;
}

export async function cycleCounts(cycleId: string, rubricVersion: string) {
  const [complete, late, byStatus] = await Promise.all([
    prisma.application.count({ where: { cycleId, afterClose: false } }),
    prisma.application.count({ where: { cycleId, afterClose: true } }),
    prisma.evaluation.groupBy({
      by: ["status"],
      where: { rubricVersion, application: { cycleId, afterClose: false } },
      _count: { _all: true },
    }),
  ]);
  const n = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const withEval = byStatus.reduce((s, b) => s + b._count._all, 0);
  return {
    complete,
    late,
    evaluated: n("COMPLETED"),
    manualReview: n("NEEDS_REVIEW"),
    failed: n("FAILED"),
    pending: n("PENDING") + n("RUNNING") + Math.max(0, complete - withEval),
  };
}
