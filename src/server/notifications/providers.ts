import "server-only";
import nodemailer from "nodemailer";
import { env, type Env } from "../env";
import {
  notificationSubject,
  notificationText,
  templateParams,
  type EmailRecipient,
  type NotificationPayload,
  type Recipient,
} from "./message";

export type SendResult =
  | { status: "SENT"; providerMessageId?: string }
  | { status: "LOGGED_LOCALLY" }
  | { status: "FAILED"; error: string };

export interface WhatsAppProvider {
  id: string;
  /** `true` sólo si hay credenciales suficientes para enviar de verdad. */
  configured: boolean;
  send(to: Recipient, payload: NotificationPayload): Promise<SendResult>;
}

export interface EmailProvider {
  id: string;
  configured: boolean;
  send(to: EmailRecipient, payload: NotificationPayload): Promise<SendResult>;
}

const TIMEOUT_MS = 10_000;

/** Mensaje de error sin secretos: sólo código HTTP y un fragmento acotado de la respuesta. */
async function describeError(res: Response): Promise<string> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 300);
  } catch {
    /* sin cuerpo */
  }
  return `HTTP ${res.status}${body ? `: ${body}` : ""}`;
}

/** Desarrollo local: escribe un aviso mínimo en consola. Nunca cuenta como "enviado". */
const consoleProvider = (e: Env): WhatsAppProvider => ({
  id: "console",
  configured: e.APP_ENV !== "production",
  async send(to, payload) {
    console.info(`[notificación simulada → ${to.label} ${to.masked}]\n${notificationText(payload)}`);
    return { status: "LOGGED_LOCALLY" };
  },
});

/**
 * WhatsApp Cloud API (Meta). Los mensajes iniciados por el negocio requieren plantillas
 * aprobadas: WHATSAPP_TEMPLATE_NAME (nueva candidatura: {{1}} nombre, {{2}} agencia,
 * {{3}} enlace) y WHATSAPP_SHORTLIST_TEMPLATE_NAME (shortlist: {{1}} perfiles,
 * {{2}} convocatoria, {{3}} enlace). Ver README.
 */
const whatsappCloudProvider = (e: Env): WhatsAppProvider => ({
  id: "whatsapp_cloud",
  configured: Boolean(e.WHATSAPP_CLOUD_TOKEN && e.WHATSAPP_CLOUD_PHONE_NUMBER_ID && e.WHATSAPP_TEMPLATE_NAME),
  async send(to, payload) {
    const template = payload.kind === "SHORTLIST" ? e.WHATSAPP_SHORTLIST_TEMPLATE_NAME : e.WHATSAPP_TEMPLATE_NAME;
    if (!template) return { status: "FAILED", error: "Falta la plantilla de WhatsApp para este tipo de aviso." };
    const url = `https://graph.facebook.com/${e.WHATSAPP_CLOUD_API_VERSION}/${e.WHATSAPP_CLOUD_PHONE_NUMBER_ID}/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${e.WHATSAPP_CLOUD_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.phone.replace("+", ""),
          type: "template",
          template: {
            name: template,
            language: { code: e.WHATSAPP_TEMPLATE_LANG },
            components: [{ type: "body", parameters: templateParams(payload).map((text) => ({ type: "text", text })) }],
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { status: "FAILED", error: await describeError(res) };
      const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
      return { status: "SENT", providerMessageId: json.messages?.[0]?.id };
    } catch (err) {
      return { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "Error de red" };
    }
  },
});

/**
 * Twilio WhatsApp. Con plantilla aprobada (TWILIO_CONTENT_SID / TWILIO_SHORTLIST_CONTENT_SID)
 * usa variables 1–3; sin ella envía texto libre (sólo sandbox o ventana de 24 h).
 */
const twilioProvider = (e: Env): WhatsAppProvider => ({
  id: "twilio",
  configured: Boolean(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_WHATSAPP_FROM),
  async send(to, payload) {
    const form = new URLSearchParams({
      From: e.TWILIO_WHATSAPP_FROM!.startsWith("whatsapp:") ? e.TWILIO_WHATSAPP_FROM! : `whatsapp:${e.TWILIO_WHATSAPP_FROM}`,
      To: `whatsapp:${to.phone}`,
    });
    const contentSid = payload.kind === "SHORTLIST" ? e.TWILIO_SHORTLIST_CONTENT_SID : e.TWILIO_CONTENT_SID;
    if (contentSid) {
      form.set("ContentSid", contentSid);
      form.set("ContentVariables", JSON.stringify(Object.fromEntries(templateParams(payload).map((v, i) => [i + 1, v]))));
    } else {
      form.set("Body", notificationText(payload));
    }
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { status: "FAILED", error: await describeError(res) };
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { status: "SENT", providerMessageId: json.sid };
    } catch (err) {
      return { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "Error de red" };
    }
  },
});

export function getProvider(e: Env = env()): WhatsAppProvider | null {
  switch (e.NOTIFY_PROVIDER) {
    case "whatsapp_cloud":
      return whatsappCloudProvider(e);
    case "twilio":
      return twilioProvider(e);
    case "console":
      return consoleProvider(e);
    default:
      return null;
  }
}

/** Correo de respaldo por SMTP (sólo si está configurado). */
export function getEmailProvider(e: Env = env()): EmailProvider {
  const configured = Boolean(e.SMTP_HOST && e.SMTP_FROM);
  return {
    id: "smtp",
    configured,
    async send(to, payload) {
      if (!configured) return { status: "FAILED", error: "SMTP no configurado." };
      try {
        const transport = nodemailer.createTransport({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_PORT === 465,
          auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
          connectionTimeout: TIMEOUT_MS,
        });
        const info = await transport.sendMail({
          from: e.SMTP_FROM,
          to: to.email,
          subject: notificationSubject(payload),
          text: notificationText(payload),
        });
        return { status: "SENT", providerMessageId: info.messageId };
      } catch (err) {
        return { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "Error SMTP" };
      }
    },
  };
}
