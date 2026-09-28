import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Auditoría general. `meta` nunca debe incluir respuestas, CV ni datos de contacto. */
export async function audit(action: string, opts: { actorId?: string | null; targetId?: string; meta?: Prisma.InputJsonValue } = {}) {
  await prisma.auditLog.create({
    data: { action, actorId: opts.actorId ?? null, targetId: opts.targetId, meta: opts.meta },
  });
}

/** Evento del expediente (registro de cambios visible en el panel). */
export async function logEvent(
  applicationId: string,
  actorId: string | null,
  type: string,
  values: { from?: string | null; to?: string | null; reason?: string | null } = {},
) {
  await prisma.applicationEvent.create({
    data: {
      applicationId,
      actorId,
      type,
      fromValue: values.from ?? null,
      toValue: values.to ?? null,
      reason: values.reason ?? null,
    },
  });
}
