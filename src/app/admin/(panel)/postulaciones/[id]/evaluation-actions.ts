"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/server/auth";
import { prisma } from "@/server/db";
import { getRubric } from "@/server/evaluation/rubrics";
import {
  confirmAiEvaluation,
  requeueEvaluation,
  saveManualEvaluation,
  sendToManualReview,
} from "@/server/evaluation/service";

const idSchema = z.string().cuid();

function done(id: string, ok = "evaluacion") {
  revalidatePath(`/admin/postulaciones/${id}`);
  revalidatePath("/admin/convocatorias", "layout");
  redirect(`/admin/postulaciones/${id}?ok=${ok}`);
}

export async function retryEvaluationAction(formData: FormData) {
  const user = await assertPermission("evaluations:manage");
  const id = idSchema.parse(formData.get("id"));
  await requeueEvaluation(id, user.id);
  done(id);
}

export async function manualReviewAction(formData: FormData) {
  const user = await assertPermission("evaluations:manage");
  const data = z
    .object({ id: idSchema, reason: z.string().trim().min(3).max(200) })
    .parse({ id: formData.get("id"), reason: formData.get("reason") });
  await sendToManualReview(data.id, user.id, data.reason);
  done(data.id);
}

export async function confirmAiEvaluationAction(formData: FormData) {
  const user = await assertPermission("evaluations:manage");
  const id = idSchema.parse(formData.get("id"));
  await confirmAiEvaluation(id, user.id);
  done(id);
}

export async function manualEvaluationAction(formData: FormData) {
  const user = await assertPermission("evaluations:manage");
  const id = idSchema.parse(formData.get("id"));
  const app = await prisma.application.findUniqueOrThrow({ where: { id }, select: { rubricVersion: true } });
  if (!app.rubricVersion) throw new Error("Sin rúbrica asignada");
  const rubric = getRubric(app.rubricVersion);
  const dims = rubric.dimensions.map((d) => ({
    id: d.id,
    score: z.coerce.number().int().min(0).max(4).parse(formData.get(`score_${d.id}`)),
    rationale: z.string().trim().min(3).max(600).parse(formData.get(`rationale_${d.id}`)),
    evidence: z.string().max(400).optional().parse(formData.get(`evidence_${d.id}`) ?? undefined),
  }));
  await saveManualEvaluation(id, user.id, dims);
  done(id);
}
