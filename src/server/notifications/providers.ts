import "server-only";
import { env, type Env } from "../env";
import type { NotificationFacts, Recipient } from "./message";
import { notificationParams, notificationText } from "./message";

export type SendResult =
  | { status: "SENT"; providerMessageId?: string }
  | { status: "LOGGED_LOCALLY" }
  | { status: "FAILED"; error: string };

export interface NotificationProvider {
  id: string;
  /** `true` sólo si hay credenciales suficientes para enviar de verdad. */
  configured: boolean;
  send(to: Recipient, facts: NotificationFacts): Promise<SendResult>;
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

/** Desarrollo local: escribe un aviso mínimo en consola. No cuenta como "enviado". */
const consoleProvider = (e: Env): NotificationProvider => ({
  id: "console",
  configured: e.APP_ENV !== "production",
  async send(to, facts) {
    console.info(`[notificación simulada → ${to.label} ${to.masked}]\n${notificationText(facts)}`);
    return { status: "LOGGED_LOCALLY" };
  },
});

/**
 * WhatsApp Cloud API (Meta). Los mensajes iniciados por el negocio requieren una
 * plantilla aprobada con 4 variables de cuerpo: {{1}} nombre, {{2}} agencia,
 * {{3}} puntaje, {{4}} enlace. Ver README.
 */
const whatsappCloudProvider = (e: Env): NotificationProvider => ({
  id: "whatsapp_cloud",
  configured: Boolean(e.WHATSAPP_CLOUD_TOKEN && e.WHATSAPP_CLOUD_PHONE_NUMBER_ID && e.WHATSAPP_TEMPLATE_NAME),
  async send(to, facts) {
    const p = notificationParams(facts);
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
            name: e.WHATSAPP_TEMPLATE_NAME,
            language: { code: e.WHATSAPP_TEMPLATE_LANG },
            components: [
              {
                type: "body",
                parameters: [p.name, p.agency, p.score, p.link].map((text) => ({ type: "text", text })),
              },
            ],
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
 * Twilio WhatsApp. Con TWILIO_CONTENT_SID usa una plantilla aprobada (variables 1–4);
 * sin ella envía texto libre, que sólo funciona en sandbox o dentro de la ventana de 24 h.
 */
const twilioProvider = (e: Env): NotificationProvider => ({
  id: "twilio",
  configured: Boolean(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_WHATSAPP_FROM),
  async send(to, facts) {
    const p = notificationParams(facts);
    const form = new URLSearchParams({
      From: e.TWILIO_WHATSAPP_FROM!.startsWith("whatsapp:") ? e.TWILIO_WHATSAPP_FROM! : `whatsapp:${e.TWILIO_WHATSAPP_FROM}`,
      To: `whatsapp:${to.phone}`,
    });
    if (e.TWILIO_CONTENT_SID) {
      form.set("ContentSid", e.TWILIO_CONTENT_SID);
      form.set("ContentVariables", JSON.stringify({ 1: p.name, 2: p.agency, 3: p.score, 4: p.link }));
    } else {
      form.set("Body", notificationText(facts));
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

export function getProvider(e: Env = env()): NotificationProvider | null {
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
