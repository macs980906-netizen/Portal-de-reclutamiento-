/**
 * Criterios de aceptación de convocatorias, evaluación y shortlist contra PostgreSQL real.
 *
 * El evaluador de estas pruebas es un doble de prueba determinista (lee un marcador en la
 * respuesta 6). Sirve para verificar el flujo (persistencia, bloqueo, ranking, avisos,
 * versiones); la calidad de la rúbrica con el modelo real se verifica con `npm run eval:rubric`.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { applicationSchema } from "@/lib/validation";
import { createApplication } from "@/server/applications";
import { closeCycle, computeCycleShortlist, createCycle, openNewVersion, resendShortlistNotice, type ShortlistSnapshot } from "@/server/cycles";
import { processPendingEvaluations, sendToManualReview } from "@/server/evaluation/service";
import type { Evaluator, EvaluatorRequest } from "@/server/evaluation/provider";
import { RUBRIC_V1 } from "@/server/evaluation/rubrics/v1";
import { registerRubric } from "@/server/evaluation/rubrics";
import { dispatchPending } from "@/server/notifications/service";

let actorId: string;

/** Doble de prueba: `[[S:4,3,3,4,3,3]]` fija las 6 calificaciones; `[[FAIL]]` simula caída del proveedor. */
function stubEvaluator(requests: EvaluatorRequest[] = []): Evaluator {
  return {
    provider: "test-double",
    model: "stub",
    async evaluate(req) {
      requests.push(req);
      if (req.user.includes("[[FAIL]]")) return { ok: false, error: "Error del proveedor (HTTP 503).", retryable: true };
      const m = /\[\[S:([0-4](?:,[0-4]){5})\]\]/.exec(req.user);
      const scores = (m?.[1] ?? "2,2,2,2,2,2").split(",").map(Number);
      const answerOf = (qid: string) => new RegExp(`<respuesta pregunta="${qid}">\\nPregunta: [^\\n]*\\nRespuesta: ([^\\n]*)`).exec(req.user)?.[1] ?? "";
      const dimensions = Object.fromEntries(
        req.rubric.dimensions.map((d, i) => [
          d.id,
          {
            score: scores[i]!,
            evidence: answerOf(d.sources[0]!).split(" ").slice(0, 4).join(" "),
            rationale: "Doble de prueba.",
            confidence: "Alto",
            needs_human_review: false,
            review_reason: "",
          },
        ]),
      );
      return { ok: true, raw: { dimensions, instructions_detected: false }, model: "stub" };
    },
  };
}

function input(name: string, marker: string) {
  return applicationSchema.parse({
    submissionKey: randomUUID(),
    contact: { firstName: name, lastName: "Prueba", phone: `55${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
    preferences: { anyAgency: false, agencyFirst: "coapa", canCommute: "si", interviewAvailability: ["sabado"], scheduleTalk: "si" },
    experience: { followupExperience: "empezando" },
    interest: { interestVacancy: "Quiero aprender a vender motos", interestTopics: ["empezando"] },
    challenge: {
      q1: "Le preguntaria para que la va a usar y cuanto quiere gastar",
      q2: "Le digo que lo confirmo con mi gerente y le marco hoy mismo",
      q3: "Le pregunto su presupuesto y le muestro opciones reales",
      q4: "Le mando la ficha y le pregunto si prefiere que le llame despues",
      q5: "Pasale con confianza, aqui estoy si tienes dudas",
      q6: `Ayude a mi vecina a decidir un plan de celular ${marker}`,
    },
    consent: { privacyAccepted: true, futureVacancies: false },
  });
}

const PDF = { bytes: new Uint8Array(Buffer.from("%PDF-1.4\n%%EOF\n")), kind: { ext: "pdf" as const, mime: "application/pdf" }, displayName: "cv.pdf" };

async function newCycle(name: string, extra: Partial<{ targetCount: number; threshold: number }> = {}) {
  return createCycle(actorId, { name, startsAt: new Date(), targetCount: 5, threshold: 70, includeUnassigned: false, ...extra });
}

async function submit(name: string, marker: string, cv = false) {
  return createApplication(input(name, marker), cv ? PDF : null, { aiEvaluationNotice: true });
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

const TWILIO = {
  NOTIFY_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "secret-token",
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
  NOTIFY_WHATSAPP_RECIPIENTS: "Abraham|+5215511111111,Verónica|+5215522222222",
};

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Notification","Evaluation","ApplicationEvent","Note","CvFile","Attribution","Application","RecruitmentCycle","AuditLog","Session","User","RateLimitBucket" CASCADE',
  );
  const u = await prisma.user.create({ data: { email: `admin-${randomUUID()}@test.local`, name: "Admin Test", role: "ADMIN", passwordHash: "x" } });
  actorId = u.id;
  setEnv({ NOTIFY_PROVIDER: "none", NOTIFY_WHATSAPP_RECIPIENTS: "", TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined, TWILIO_WHATSAPP_FROM: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("convocatoria con muchas candidaturas", () => {
  it("50 postulaciones quedan guardadas con evaluación real o error visible; los fallos bloquean el cierre", async () => {
    const cycle = await newCycle("Octubre");
    for (let i = 0; i < 50; i++) {
      const marker = i < 3 ? "[[FAIL]]" : `[[S:${[4, 3, 3, 2][i % 4]},3,3,3,3,${[4, 3, 2][i % 3]}]]`;
      await submit(`Cand${i}`, marker, i % 10 === 0);
    }
    expect(await prisma.application.count({ where: { cycleId: cycle.id } })).toBe(50);
    expect(await prisma.cvFile.count()).toBe(5);

    await processPendingEvaluations({ evaluator: stubEvaluator() });
    const byStatus = await prisma.evaluation.groupBy({ by: ["status"], _count: { _all: true } });
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    expect(count("COMPLETED")).toBe(47);
    expect(count("FAILED")).toBe(3);
    expect(await prisma.evaluation.count()).toBe(50);
    const failed = await prisma.evaluation.findMany({ where: { status: "FAILED" } });
    expect(failed.every((f) => f.lastError?.includes("503") && f.total === null)).toBe(true);

    // Abierta: ranking provisional, sin aviso final.
    const provisional = await computeCycleShortlist(cycle.id);
    expect(provisional.cycle.status).toBe("OPEN");
    expect(await prisma.notification.count({ where: { kind: "SHORTLIST" } })).toBe(0);

    // Cierre bloqueado por los 3 fallos (el reintento automático vuelve a fallar).
    const blocked = await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.reason === "blocked") expect(blocked.blocked).toHaveLength(3);
    expect((await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe("OPEN");

    // Enviarlas a revisión manual desbloquea el cierre; quedan separadas, no excluidas en silencio.
    for (const f of failed) await sendToManualReview(f.applicationId, actorId, "Proveedor caído");
    await sendToManualReview(failed[0]!.applicationId, actorId, "Doble clic"); // no debe duplicar
    const once = await prisma.evaluation.findFirstOrThrow({ where: { applicationId: failed[0]!.applicationId } });
    expect(once.reviewReasons).toEqual(["Enviada a revisión manual: Proveedor caído"]);
    const closed = await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.snapshot.manualReview).toHaveLength(3);
      expect(closed.snapshot.recommended.length).toBeLessThanOrEqual(5 + (closed.snapshot.tie?.applicationIds.length ?? 0));
      expect(closed.snapshot.recommended.every((r) => r.total >= 70)).toBe(true);
      expect(closed.snapshot.rubricVersion).toBe(RUBRIC_V1.version);
    }
    const audit = await prisma.auditLog.findFirst({ where: { action: "CYCLE_CLOSED", targetId: cycle.id } });
    expect(audit?.actorId).toBe(actorId);
    expect((audit?.meta as { rubricVersion: string }).rubricVersion).toBe(RUBRIC_V1.version);
  });
});

describe("reglas de la shortlist al cerrar", () => {
  async function closeWith(markers: string[], extra = {}) {
    const cycle = await newCycle("Convocatoria", extra);
    for (const [i, m] of markers.entries()) await submit(`P${i}`, m);
    const res = await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    if (!res.ok) throw new Error("no cerró");
    return res.snapshot;
  }

  it("si sólo 3 superan el umbral se recomiendan 3 y el aviso dice 3", async () => {
    setEnv(TWILIO);
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(String(init.body));
      return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
    }));
    const snap = await closeWith(["[[S:4,4,4,4,4,4]]", "[[S:4,3,3,3,3,3]]", "[[S:3,3,3,3,3,3]]", "[[S:2,2,2,2,2,2]]", "[[S:1,1,1,1,1,1]]", "[[S:2,3,2,2,2,2]]"]);
    expect(snap.recommended.map((r) => r.total)).toEqual([100, 80, 75]);
    expect(calls).toHaveLength(2);
    expect(calls.every((b) => (new URLSearchParams(b).get("Body") ?? "").includes("3 perfiles recomendados"))).toBe(true);
  });

  it("empate en el quinto lugar: se incluyen todas y se marca para revisión", async () => {
    const snap = await closeWith(["[[S:4,4,4,4,4,4]]", "[[S:4,4,4,4,4,3]]", "[[S:4,4,4,4,3,3]]", "[[S:4,4,4,3,3,3]]", "[[S:3,3,3,3,3,3]]", "[[S:3,3,3,3,3,3]]", "[[S:3,3,3,3,3,3]]"]);
    expect(snap.recommended).toHaveLength(7);
    expect(snap.tie?.applicationIds).toHaveLength(3);
    expect(snap.tie?.openSlots).toBe(1);
  });

  it("el orden de envío no altera el ranking final", async () => {
    const markers = Array.from({ length: 20 }, (_, i) => `[[S:${i % 5},${(i * 3) % 5},4,${i % 4},3,${(i * 7) % 5}]]`);
    const run = async (order: string[]) => {
      const snap = await closeWith(order);
      const apps = await prisma.application.findMany({ where: { id: { in: snap.ranked.map((r) => r.applicationId) } }, select: { id: true, challengeAnswers: true } });
      const markerOf = new Map(apps.map((a) => [a.id, (a.challengeAnswers as { q6: string }).q6.match(/\[\[S:.*\]\]/)![0]]));
      await prisma.recruitmentCycle.updateMany({ data: { status: "CLOSED" } });
      return {
        recommended: snap.recommended.map((r) => `${r.total}|${markerOf.get(r.applicationId)}`).sort(),
        totals: snap.ranked.map((r) => r.total),
        tie: snap.tie?.applicationIds.length ?? 0,
      };
    };
    const a = await run(markers);
    await prisma.$executeRawUnsafe('TRUNCATE "Notification","Evaluation","ApplicationEvent","Application","RecruitmentCycle" CASCADE');
    const b = await run([...markers].reverse());
    expect(b).toEqual(a);
  });

  it("el CV es opcional y su ausencia no cambia la evaluación", async () => {
    const cycle = await newCycle("CV");
    const requests: EvaluatorRequest[] = [];
    const withCv = await submit("ConCV", "[[S:3,3,3,3,3,3]]", true);
    const without = await submit("SinCV", "[[S:3,3,3,3,3,3]]", false);
    await processPendingEvaluations({ evaluator: stubEvaluator(requests), cycleId: cycle.id });
    const [e1, e2] = await Promise.all([
      prisma.evaluation.findFirstOrThrow({ where: { applicationId: withCv.id } }),
      prisma.evaluation.findFirstOrThrow({ where: { applicationId: without.id } }),
    ]);
    expect(e1.total).toBe(e2.total);
    const strip = (u: string) => u.replace(/EV-\w+/, "EV").replace(/\[NOMBRE\]/g, "");
    expect(strip(requests[0]!.user)).toBe(strip(requests[1]!.user));
    expect(requests[0]!.user).not.toMatch(/ConCV|SinCV|cv\.pdf|55\d{8}/);
  });
});

describe("avisos de shortlist", () => {
  it("al cerrar, cada destinatario recibe un solo aviso; reintentos y doble clic no duplican", async () => {
    setEnv(TWILIO);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const cycle = await newCycle("Avisos");
    await submit("A", "[[S:4,4,4,4,4,4]]");
    const res = await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const again = await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    expect(again.ok).toBe(false);
    await dispatchPending();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const rows = await prisma.notification.findMany({ where: { cycleId: cycle.id } });
    expect(rows.map((r) => r.recipientLabel).sort()).toEqual(["Abraham", "Verónica"]);
    expect(rows.every((r) => r.status === "SENT" && r.provider === "twilio" && !JSON.stringify(r).includes("secret-token"))).toBe(true);
    expect((rows[0]!.payload as { link: string }).link).toBe(`https://portal.test/admin/convocatorias/${cycle.id}`);

    expect(await resendShortlistNotice(cycle.id, actorId, 0)).toBe(true);
    expect(await resendShortlistNotice(cycle.id, actorId, 0)).toBe(false); // doble clic
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(await prisma.auditLog.count({ where: { action: "SHORTLIST_NOTICE_RESENT" } })).toBe(1);
  });

  it("sin credenciales queda 'pendiente de configuración' visible por destinatario y no se simula el envío", async () => {
    setEnv({ ...TWILIO, TWILIO_AUTH_TOKEN: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cycle = await newCycle("Sin credenciales");
    await submit("A", "[[S:4,4,4,4,4,4]]");
    await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    const rows = await prisma.notification.findMany({ where: { cycleId: cycle.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "NOT_CONFIGURED" && r.sentAt === null)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("postulaciones tardías y versiones", () => {
  it("una postulación posterior al cierre no entra a la shortlist cerrada y pasa a una nueva versión", async () => {
    const cycle = await newCycle("Tardías");
    await submit("A", "[[S:4,4,4,4,4,4]]");
    const closed = await closeCycle(cycle.id, actorId, { evaluator: stubEvaluator() });
    const late = await submit("Tarde", "[[S:4,4,4,4,4,4]]");
    const lateRow = await prisma.application.findUniqueOrThrow({ where: { id: late.id } });
    expect(lateRow.afterClose).toBe(true);
    const snap = (await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: cycle.id } })).shortlist as unknown as ShortlistSnapshot;
    expect(snap.recommended.map((r) => r.applicationId)).not.toContain(late.id);
    expect(closed.ok && closed.snapshot.recommended).toHaveLength(1);

    const child = await openNewVersion(cycle.id, actorId);
    const moved = await prisma.application.findUniqueOrThrow({ where: { id: late.id } });
    expect(moved.cycleId).toBe(child.id);
    expect(moved.afterClose).toBe(false);
  });

  it("una rúbrica nueva no modifica evaluaciones ni la shortlist de convocatorias anteriores", async () => {
    const a = await newCycle("A (rúbrica v1)");
    await submit("Uno", "[[S:4,3,3,3,3,3]]");
    const closed = await closeCycle(a.id, actorId, { evaluator: stubEvaluator() });
    if (!closed.ok) throw new Error("no cerró");
    const before = await prisma.evaluation.findMany({ where: { application: { cycleId: a.id } }, orderBy: { id: "asc" } });

    const v2 = { ...RUBRIC_V1, version: "rubrica-test-v2", dimensions: RUBRIC_V1.dimensions.map((d, i) => ({ ...d, weight: i === 0 ? 40 : 12 })) };
    registerRubric(v2);
    const b = await prisma.recruitmentCycle.create({ data: { name: "B (rúbrica v2)", startsAt: new Date(), rubricVersion: v2.version, eligibilityVersion: "x" } });
    const appB = await submit("Dos", "[[S:4,3,3,3,3,3]]");
    await processPendingEvaluations({ evaluator: stubEvaluator() });
    const evB = await prisma.evaluation.findFirstOrThrow({ where: { applicationId: appB.id } });
    expect(evB.rubricVersion).toBe(v2.version);
    expect(evB.total).not.toBe(before[0]!.total);

    const after = await prisma.evaluation.findMany({ where: { application: { cycleId: a.id } }, orderBy: { id: "asc" } });
    expect(after.map((e) => [e.rubricVersion, e.total, e.weights])).toEqual(before.map((e) => [e.rubricVersion, e.total, e.weights]));
    const snapAfter = (await prisma.recruitmentCycle.findUniqueOrThrow({ where: { id: a.id } })).shortlist;
    expect(snapAfter).toEqual(JSON.parse(JSON.stringify(closed.snapshot)));
    expect(b.id).toBeTruthy();
  });
});
