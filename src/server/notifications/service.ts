import "server-only";
import { prisma } from "../db";
import { env } from "../env";
import { hmac } from "../crypto";
import { agencyName } from "@/config/agencies";
import { parseRecipients, type NotificationFacts } from "./message";
import { getProvider } from "./providers";

export const NOTIFICATION_STATUS = {
  PENDING: "Pendiente",
  SENDING: "Enviando",
  SENT: "Enviada",
  FAILED: "Falló",
  NOT_CONFIGURED: "Requiere configuración",
  LOGGED_LOCALLY: "Registrada en consola (desarrollo)",
} as const;

const MAX_ATTEMPTS = 5;

/**
 * Crea (idempotentemente) las notificaciones de una candidatura nueva y las intenta
 * enviar. Nunca lanza: un fallo de notificación no debe afectar la postulación.
 */
export async function notifyNewApplication(applicationId: string): Promise<void> {
  try {
    const e = env();
    const provider = getProvider(e);
    const recipients = parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS);
    const ready = Boolean(provider?.configured && recipients.length);
    const providerId = provider?.id ?? "none";

    if (!ready) {
      await prisma.notification.upsert({
        where: { dedupeKey: `new-application:${applicationId}:unconfigured` },
        create: {
          applicationId,
          dedupeKey: `new-application:${applicationId}:unconfigured`,
          channel: "whatsapp",
          provider: providerId,
          recipientLabel: recipients.length ? "Destinatarios configurados" : "Sin destinatarios configurados",
          recipientMasked: "—",
          status: "NOT_CONFIGURED",
          lastError: !provider?.configured
            ? `Proveedor "${providerId}" sin credenciales suficientes.`
            : "NOTIFY_WHATSAPP_RECIPIENTS vacío.",
        },
        update: {},
      });
      return;
    }

    for (const r of recipients) {
      const dedupeKey = `new-application:${applicationId}:whatsapp:${hmac(r.phone).slice(0, 24)}`;
      await prisma.notification.upsert({
        where: { dedupeKey },
        create: {
          applicationId,
          dedupeKey,
          channel: "whatsapp",
          provider: providerId,
          recipientLabel: r.label,
          recipientMasked: r.masked,
          status: "PENDING",
        },
        update: {},
      });
    }
    await dispatchPending({ applicationId });
  } catch (err) {
    console.error("[notificaciones] error al preparar notificación", err instanceof Error ? err.message : err);
  }
}

/**
 * Envía notificaciones pendientes o fallidas. Cada fila se "reclama" con una
 * actualización condicional, así dos procesos no pueden enviar la misma dos veces.
 */
export async function dispatchPending(filter: { applicationId?: string; ids?: string[] } = {}) {
  const e = env();
  const provider = getProvider(e);
  const recipients = parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS);
  if (!provider?.configured || !recipients.length) return { attempted: 0 };

  // Envíos interrumpidos (proceso caído a mitad de envío) vuelven a quedar reintentables.
  await prisma.notification.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "FAILED", lastError: "Envío interrumpido; se reintentará." },
  });

  const rows = await prisma.notification.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      applicationId: filter.applicationId,
      id: filter.ids ? { in: filter.ids } : undefined,
    },
    include: { application: { select: { id: true, firstName: true, lastName: true, agencyFirst: true, anyAgency: true, scoreTotal: true } } },
    take: 50,
  });

  let attempted = 0;
  for (const row of rows) {
    const claimed = await prisma.notification.updateMany({
      where: { id: row.id, status: row.status, attempts: row.attempts },
      data: { status: "SENDING", attempts: { increment: 1 }, provider: provider.id },
    });
    if (claimed.count === 0) continue;
    attempted++;

    const recipient = recipients.find((r) => row.dedupeKey.endsWith(hmac(r.phone).slice(0, 24)));
    if (!recipient) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: "FAILED", lastError: "El destinatario ya no está configurado." },
      });
      continue;
    }
    const a = row.application;
    const facts: NotificationFacts = {
      applicationId: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      agency: a.agencyFirst ? agencyName(a.agencyFirst) : a.anyAgency ? "Cualquiera" : "—",
      score: a.scoreTotal,
      appUrl: e.APP_URL,
    };
    const result = await provider.send(recipient, facts);
    await prisma.notification.update({
      where: { id: row.id },
      data:
        result.status === "FAILED"
          ? { status: "FAILED", lastError: result.error }
          : {
              status: result.status,
              lastError: null,
              sentAt: new Date(),
              providerMessageId: result.status === "SENT" ? (result.providerMessageId ?? null) : null,
            },
    });
  }
  return { attempted };
}

/** Convierte registros "Requiere configuración" en envíos reales una vez que hay credenciales. */
export async function requeueUnconfigured() {
  const e = env();
  const provider = getProvider(e);
  const recipients = parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS);
  if (!provider?.configured || !recipients.length) return { requeued: 0 };
  const rows = await prisma.notification.findMany({ where: { status: "NOT_CONFIGURED" }, select: { id: true, applicationId: true } });
  for (const row of rows) {
    await prisma.notification.delete({ where: { id: row.id } });
    await notifyNewApplication(row.applicationId);
  }
  return { requeued: rows.length };
}
