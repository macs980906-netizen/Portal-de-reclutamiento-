import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { hmac } from "../crypto";
import { agencyName } from "@/config/agencies";
import {
  newApplicationPayload,
  parseEmailRecipients,
  parseRecipients,
  type NotificationPayload,
} from "./message";
import { getEmailProvider, getProvider } from "./providers";

export const NOTIFICATION_STATUS = {
  PENDING: "Pendiente de envío",
  SENDING: "Enviando",
  SENT: "Enviada",
  FAILED: "Falló",
  NOT_CONFIGURED: "Pendiente de configuración",
  LOGGED_LOCALLY: "Sólo registrada en consola (desarrollo, no enviada)",
} as const;

const MAX_ATTEMPTS = 5;
const recipientKey = (value: string) => hmac(value).slice(0, 24);

type Target = { applicationId?: string; cycleId?: string };

/**
 * Crea (idempotentemente) las notificaciones de un aviso para todos los destinatarios
 * configurados y las intenta enviar. `baseKey` identifica el aviso: repetir la llamada con
 * la misma clave no duplica mensajes. Nunca lanza.
 *
 * Canales: WhatsApp si está configurado. Si no lo está, queda un registro visible
 * "Pendiente de configuración" y, sólo si hay SMTP configurado, se envía correo de respaldo.
 */
export async function createNotifications(baseKey: string, payload: NotificationPayload, target: Target) {
  try {
    const e = env();
    const wa = getProvider(e);
    const email = getEmailProvider(e);
    const waRecipients = parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS);
    const emailRecipients = parseEmailRecipients(e.NOTIFY_EMAIL_RECIPIENTS);
    const waReady = Boolean(wa?.configured);
    const common = {
      kind: payload.kind,
      applicationId: target.applicationId,
      cycleId: target.cycleId,
      payload: payload as Prisma.InputJsonValue,
    };

    const upsert = (dedupeKey: string, data: Omit<Prisma.NotificationUncheckedCreateInput, "dedupeKey">) =>
      prisma.notification.upsert({ where: { dedupeKey }, create: { dedupeKey, ...data }, update: {} });

    if (!waRecipients.length) {
      await upsert(`${baseKey}:whatsapp:unconfigured`, {
        ...common,
        channel: "whatsapp",
        provider: wa?.id ?? "none",
        recipientLabel: "Sin destinatarios de WhatsApp configurados",
        recipientMasked: "—",
        status: "NOT_CONFIGURED",
        lastError: "NOTIFY_WHATSAPP_RECIPIENTS vacío.",
      });
    }
    for (const r of waRecipients) {
      await upsert(`${baseKey}:whatsapp:${waReady ? recipientKey(r.phone) : `unconfigured:${recipientKey(r.phone)}`}`, {
        ...common,
        channel: "whatsapp",
        provider: wa?.id ?? "none",
        recipientLabel: r.label,
        recipientMasked: r.masked,
        status: waReady ? "PENDING" : "NOT_CONFIGURED",
        lastError: waReady ? null : `Proveedor de WhatsApp "${wa?.id ?? "none"}" sin credenciales suficientes.`,
      });
    }
    if (email.configured) {
      const waLabels = new Set(waReady ? waRecipients.map((r) => r.label.toLowerCase()) : []);
      for (const r of emailRecipients) {
        if (waLabels.has(r.label.toLowerCase())) continue; // ya recibe por WhatsApp
        await upsert(`${baseKey}:email:${recipientKey(r.email)}`, {
          ...common,
          channel: "email",
          provider: email.id,
          recipientLabel: r.label,
          recipientMasked: r.masked,
          status: "PENDING",
        });
      }
    }
    await dispatchPending({ dedupePrefix: baseKey });
  } catch (err) {
    console.error("[notificaciones] error al preparar aviso", err instanceof Error ? err.message : err);
  }
}

/** Aviso mínimo por cada postulación nueva (si NOTIFY_EACH_APPLICATION=true). */
export async function notifyNewApplication(applicationId: string): Promise<void> {
  const e = env();
  if (e.NOTIFY_EACH_APPLICATION !== "true") return;
  const a = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, firstName: true, lastName: true, agencyFirst: true, anyAgency: true },
  });
  if (!a) return;
  const payload = newApplicationPayload({
    applicationId: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    agency: a.agencyFirst ? agencyName(a.agencyFirst) : a.anyAgency ? "Cualquiera" : "—",
    appUrl: e.APP_URL,
  });
  await createNotifications(`new-application:${applicationId}`, payload, { applicationId });
}

async function payloadFor(row: { payload: unknown; applicationId: string | null }): Promise<NotificationPayload | null> {
  if (row.payload) return row.payload as NotificationPayload;
  // Registros anteriores sin payload (avisos por postulación).
  if (!row.applicationId) return null;
  const a = await prisma.application.findUnique({
    where: { id: row.applicationId },
    select: { id: true, firstName: true, lastName: true, agencyFirst: true, anyAgency: true },
  });
  if (!a) return null;
  return newApplicationPayload({
    applicationId: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    agency: a.agencyFirst ? agencyName(a.agencyFirst) : a.anyAgency ? "Cualquiera" : "—",
    appUrl: env().APP_URL,
  });
}

/**
 * Envía notificaciones pendientes o fallidas. Cada fila se "reclama" con una
 * actualización condicional, así dos procesos no pueden enviar la misma dos veces.
 */
export async function dispatchPending(filter: { dedupePrefix?: string; ids?: string[] } = {}) {
  const e = env();
  const wa = getProvider(e);
  const email = getEmailProvider(e);
  const waRecipients = parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS);
  const emailRecipients = parseEmailRecipients(e.NOTIFY_EMAIL_RECIPIENTS);

  await prisma.notification.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "FAILED", lastError: "Envío interrumpido; se reintentará." },
  });

  const rows = await prisma.notification.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      dedupeKey: filter.dedupePrefix ? { startsWith: `${filter.dedupePrefix}:` } : undefined,
      id: filter.ids ? { in: filter.ids } : undefined,
    },
    take: 100,
  });

  let attempted = 0;
  for (const row of rows) {
    const isEmail = row.channel === "email";
    if (isEmail ? !email.configured : !wa?.configured) continue;
    const claimed = await prisma.notification.updateMany({
      where: { id: row.id, status: row.status, attempts: row.attempts },
      data: { status: "SENDING", attempts: { increment: 1 }, provider: isEmail ? email.id : wa!.id },
    });
    if (claimed.count === 0) continue;
    attempted++;

    const payload = await payloadFor(row);
    const suffix = row.dedupeKey.split(":").pop()!;
    const waTo = waRecipients.find((r) => recipientKey(r.phone) === suffix);
    const emailTo = emailRecipients.find((r) => recipientKey(r.email) === suffix);
    if (!payload || (isEmail ? !emailTo : !waTo)) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: "FAILED", lastError: payload ? "El destinatario ya no está configurado." : "Aviso sin contenido." },
      });
      continue;
    }
    const result = isEmail ? await email.send(emailTo!, payload) : await wa!.send(waTo!, payload);
    await prisma.notification.update({
      where: { id: row.id },
      data:
        result.status === "FAILED"
          ? { status: "FAILED", lastError: result.error }
          : {
              status: result.status,
              lastError: null,
              sentAt: result.status === "SENT" ? new Date() : null,
              providerMessageId: result.status === "SENT" ? (result.providerMessageId ?? null) : null,
            },
    });
  }
  return { attempted };
}

/** Convierte registros "Pendiente de configuración" en envíos reales cuando ya hay credenciales. */
export async function requeueUnconfigured() {
  const rows = await prisma.notification.findMany({
    where: { status: "NOT_CONFIGURED" },
    select: { id: true, dedupeKey: true, payload: true, applicationId: true, cycleId: true },
  });
  const e = env();
  if (!getProvider(e)?.configured && !getEmailProvider(e).configured) return { requeued: 0 };
  const done = new Set<string>();
  let requeued = 0;
  for (const row of rows) {
    const baseKey = row.dedupeKey.split(":whatsapp:")[0]!;
    const payload = await payloadFor(row);
    if (!payload) continue;
    await prisma.notification.delete({ where: { id: row.id } });
    if (done.has(baseKey)) continue;
    done.add(baseKey);
    await createNotifications(baseKey, payload, { applicationId: row.applicationId ?? undefined, cycleId: row.cycleId ?? undefined });
    requeued++;
  }
  return { requeued };
}

/** Estado de cada canal para el panel (sin exponer tokens ni números completos). */
export async function channelStatus() {
  const e = env();
  const wa = getProvider(e);
  const email = getEmailProvider(e);
  const [waLast, emailLast] = await Promise.all([
    prisma.notification.findFirst({ where: { channel: "whatsapp", status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    prisma.notification.findFirst({ where: { channel: "email", status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);
  return {
    whatsapp: {
      provider: e.NOTIFY_PROVIDER,
      configured: Boolean(wa?.configured) && e.NOTIFY_PROVIDER !== "console",
      simulated: e.NOTIFY_PROVIDER === "console",
      recipients: parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS).map((r) => `${r.label} (${r.masked})`),
      shortlistTemplate: e.NOTIFY_PROVIDER === "whatsapp_cloud" ? Boolean(e.WHATSAPP_SHORTLIST_TEMPLATE_NAME) : e.NOTIFY_PROVIDER === "twilio" ? Boolean(e.TWILIO_SHORTLIST_CONTENT_SID) : null,
      lastSentAt: waLast?.sentAt ?? null,
    },
    email: {
      provider: "smtp",
      configured: email.configured,
      recipients: parseEmailRecipients(e.NOTIFY_EMAIL_RECIPIENTS).map((r) => `${r.label} (${r.masked})`),
      lastSentAt: emailLast?.sentAt ?? null,
    },
  };
}
