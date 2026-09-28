"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/server/auth";
import { prisma } from "@/server/db";
import { logEvent } from "@/server/audit";
import {
  CycleError,
  closeCycle,
  createCycle,
  markNotSelected,
  openNewVersion,
  resendShortlistNotice,
  setCycleReview,
  updateCycleSettings,
} from "@/server/cycles";
import { processPendingEvaluations, requeueEvaluation, sendToManualReview } from "@/server/evaluation/service";

const idSchema = z.string().cuid();
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((d) => new Date(`${d}T00:00:00-06:00`));
const optionalEnd = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional())
  .transform((d) => (d ? new Date(`${d}T23:59:59-06:00`) : null));

const settings = {
  targetCount: z.coerce.number().int().min(1).max(50),
  threshold: z.coerce.number().min(0).max(100),
};

function back(id: string, qs = "") {
  revalidatePath(`/admin/convocatorias/${id}`);
  revalidatePath("/admin/convocatorias");
  redirect(`/admin/convocatorias/${id}${qs}`);
}

async function guard<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CycleError) {
      const msg = encodeURIComponent(err.message);
      redirect(id ? `/admin/convocatorias/${id}?error=${msg}` : `/admin/convocatorias?error=${msg}`);
    }
    throw err;
  }
}

export async function createCycleAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const data = z
    .object({
      name: z.string().trim().min(3).max(120),
      startsAt: dateInput,
      endsAt: optionalEnd,
      includeUnassigned: z.preprocess((v) => v === "on", z.boolean()),
      ...settings,
    })
    .parse(Object.fromEntries(formData));
  const cycle = await guard(null, () => createCycle(user.id, data));
  back(cycle.id, "?ok=creada");
}

export async function updateSettingsAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const data = z
    .object({ id: idSchema, name: z.string().trim().min(3).max(120), endsAt: optionalEnd, ...settings })
    .parse(Object.fromEntries(formData));
  await guard(data.id, () => updateCycleSettings(user.id, data.id, { name: data.name, endsAt: data.endsAt, targetCount: data.targetCount, threshold: data.threshold }));
  back(data.id, "?ok=parametros");
}

export async function reviewToggleAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const id = idSchema.parse(formData.get("id"));
  await setCycleReview(user.id, id, formData.get("review") === "1");
  back(id);
}

export async function closeCycleAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const id = idSchema.parse(formData.get("id"));
  if (formData.get("confirm") !== "on") back(id, "?error=" + encodeURIComponent("Confirma que deseas cerrar la convocatoria."));
  const result = await closeCycle(id, user.id);
  if (result.ok) back(id, "?ok=cerrada");
  else if (result.reason === "blocked") back(id, "?cierre=bloqueado");
  else back(id, `?error=${encodeURIComponent(result.message)}`);
}

export async function resendNoticeAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const id = idSchema.parse(formData.get("id"));
  const seq = z.coerce.number().int().min(0).parse(formData.get("seq"));
  const sent = await guard(id, () => resendShortlistNotice(id, user.id, seq));
  back(id, sent ? "?ok=reenviado" : "?error=" + encodeURIComponent("El aviso ya se había reenviado; recarga la página."));
}

export async function newVersionAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const id = idSchema.parse(formData.get("id"));
  const child = await guard(id, () => openNewVersion(id, user.id));
  back(child.id, "?ok=version");
}

export async function markNotSelectedAction(formData: FormData) {
  const user = await assertPermission("cycles:manage");
  const id = idSchema.parse(formData.get("id"));
  if (formData.get("confirm") !== "on") back(id, "?error=" + encodeURIComponent("Marca la casilla de confirmación."));
  const n = await guard(id, () => markNotSelected(id, user.id));
  back(id, `?ok=marcadas&n=${n}`);
}

export async function retryAllAction(formData: FormData) {
  await assertPermission("evaluations:manage");
  const id = idSchema.parse(formData.get("id"));
  await processPendingEvaluations({ cycleId: id });
  back(id, "?ok=reintento");
}

export async function queueRetryAction(formData: FormData) {
  const user = await assertPermission("evaluations:manage");
  const cycleId = idSchema.parse(formData.get("cycleId"));
  const appId = idSchema.parse(formData.get("applicationId"));
  await requeueEvaluation(appId, user.id);
  back(cycleId, "?ok=reintento");
}

export async function queueManualAction(formData: FormData) {
  const user = await assertPermission("evaluations:manage");
  const cycleId = idSchema.parse(formData.get("cycleId"));
  const appId = idSchema.parse(formData.get("applicationId"));
  await sendToManualReview(appId, user.id, "Enviada desde la cola de la convocatoria");
  back(cycleId, "?ok=manual");
}

const QUICK = ["INVITAR_ENTREVISTA", "REVISION_MANUAL", "NO_SELECCIONADA"] as const;

/** Acciones rápidas por candidatura: Invitar a entrevista / Revisar manualmente / No continúa en esta ronda. */
export async function quickStatusAction(formData: FormData) {
  const user = await assertPermission("applications:status");
  const data = z
    .object({ cycleId: idSchema, applicationId: idSchema, status: z.enum(QUICK) })
    .parse(Object.fromEntries(formData));
  const app = await prisma.application.findUniqueOrThrow({ where: { id: data.applicationId }, select: { status: true } });
  if (app.status !== data.status) {
    await prisma.application.update({ where: { id: data.applicationId }, data: { status: data.status, reviewedAt: new Date() } });
    await logEvent(data.applicationId, user.id, "STATUS", { from: app.status, to: data.status, reason: "Desde la convocatoria" });
  }
  back(data.cycleId, "?ok=estado");
}
