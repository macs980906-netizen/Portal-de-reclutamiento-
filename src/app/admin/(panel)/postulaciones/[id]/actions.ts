"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STATUS_IDS } from "@/config/statuses";
import { assertPermission } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit, logEvent } from "@/server/audit";
import { deleteApplication } from "@/server/applications";

const idSchema = z.string().cuid();
const reason = z
  .string()
  .trim()
  .max(280)
  .optional()
  .transform((v) => (v ? v : undefined));

function done(id: string, ok: string) {
  revalidatePath(`/admin/postulaciones/${id}`);
  revalidatePath("/admin/postulaciones");
  redirect(`/admin/postulaciones/${id}?ok=${ok}`);
}

export async function updateStatusAction(formData: FormData) {
  const user = await assertPermission("applications:status");
  const data = z
    .object({ id: idSchema, status: z.enum(STATUS_IDS), reason })
    .parse({ id: formData.get("id"), status: formData.get("status"), reason: formData.get("reason") ?? undefined });
  const app = await prisma.application.findUniqueOrThrow({ where: { id: data.id }, select: { status: true } });
  if (app.status !== data.status) {
    await prisma.application.update({ where: { id: data.id }, data: { status: data.status, reviewedAt: new Date() } });
    await logEvent(data.id, user.id, "STATUS", { from: app.status, to: data.status, reason: data.reason });
  }
  done(data.id, "estado");
}

export async function updatePriorityAction(formData: FormData) {
  const user = await assertPermission("applications:priority");
  const data = z
    .object({ id: idSchema, priority: z.coerce.number().int().min(-1).max(1), reason })
    .parse({ id: formData.get("id"), priority: formData.get("priority"), reason: formData.get("reason") ?? undefined });
  const app = await prisma.application.findUniqueOrThrow({ where: { id: data.id }, select: { priority: true } });
  if (app.priority !== data.priority) {
    await prisma.application.update({
      where: { id: data.id },
      data: { priority: data.priority, priorityReason: data.reason ?? null },
    });
    await logEvent(data.id, user.id, "PRIORITY", { from: String(app.priority), to: String(data.priority), reason: data.reason });
  }
  done(data.id, "prioridad");
}

export async function rateAction(formData: FormData) {
  const user = await assertPermission("applications:rate");
  const data = z
    .object({ id: idSchema, rating: z.coerce.number().int().min(1).max(5), reason })
    .parse({ id: formData.get("id"), rating: formData.get("rating"), reason: formData.get("reason") ?? undefined });
  const app = await prisma.application.findUniqueOrThrow({ where: { id: data.id }, select: { humanRating: true } });
  await prisma.application.update({ where: { id: data.id }, data: { humanRating: data.rating, reviewedAt: new Date() } });
  await logEvent(data.id, user.id, "RATING", {
    from: app.humanRating ? String(app.humanRating) : null,
    to: String(data.rating),
    reason: data.reason,
  });
  done(data.id, "calificacion");
}

export async function addNoteAction(formData: FormData) {
  const user = await assertPermission("applications:note");
  const data = z
    .object({ id: idSchema, body: z.string().trim().min(1).max(2000) })
    .parse({ id: formData.get("id"), body: formData.get("body") });
  await prisma.note.create({ data: { applicationId: data.id, authorId: user.id, body: data.body } });
  done(data.id, "nota");
}

/** Borrado definitivo (p. ej. solicitud ARCO de cancelación). Requiere escribir el código. */
export async function deleteAction(formData: FormData) {
  const user = await assertPermission("applications:delete");
  const data = z
    .object({ id: idSchema, confirm: z.string().trim().toUpperCase(), reason: z.string().trim().min(3).max(280) })
    .parse({ id: formData.get("id"), confirm: formData.get("confirm"), reason: formData.get("reason") });
  const app = await prisma.application.findUniqueOrThrow({ where: { id: data.id }, select: { code: true } });
  if (app.code !== data.confirm) redirect(`/admin/postulaciones/${data.id}?error=confirmacion`);
  await deleteApplication(data.id);
  // La auditoría conserva sólo el código y el motivo, no datos personales.
  await audit("APPLICATION_DELETED", { actorId: user.id, targetId: app.code, meta: { reason: data.reason } });
  revalidatePath("/admin/postulaciones");
  redirect("/admin/postulaciones?deleted=1");
}
