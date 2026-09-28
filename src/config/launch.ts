import { AGENCIES_CONFIRMED } from "./agencies";
import { BUSINESS, hasConfirmedOffer } from "./business";
import { LEGAL, RETENTION, isLegalComplete } from "./legal";

export type LaunchItem = {
  id: string;
  /** `blocker` impide el build/arranque de producción; `pending` se muestra como advertencia. */
  level: "blocker" | "pending";
  title: string;
  detail: string;
};

type EnvLike = Record<string, string | undefined>;

/**
 * Lista de pendientes para lanzar a producción. Se usa en `npm run check:launch`,
 * al arrancar el servidor en producción y en el panel de administración.
 */
export function getLaunchItems(env: EnvLike = process.env): LaunchItem[] {
  const items: LaunchItem[] = [];

  if (!isLegalComplete(LEGAL)) {
    items.push({
      id: "privacy-notice",
      level: "blocker",
      title: "Aviso de privacidad integral aprobado",
      detail:
        "Faltan responsable, domicilio, canal y procedimiento ARCO, medios para limitar uso/divulgación, versión y fecha del aviso (src/config/legal.ts).",
    });
  }
  if (RETENTION.applicationDays === null || RETENTION.futureVacanciesDays === null) {
    items.push({
      id: "retention",
      level: "blocker",
      title: "Política de retención",
      detail: "El plazo de conservación de postulaciones no está aprobado (RETENTION en src/config/legal.ts).",
    });
  }
  if (!AGENCIES_CONFIRMED) {
    items.push({
      id: "agencies",
      level: "blocker",
      title: "Validación de sucursales",
      detail:
        "Confirmar direcciones, operación actual y horarios de las cuatro agencias (AGENCIES_CONFIRMED en src/config/agencies.ts).",
    });
  }
  if (!BUSINESS.jobSchedule) {
    items.push({
      id: "job-schedule",
      level: "pending",
      title: "Horario real del puesto",
      detail: "No se muestra horario del asesor; el formulario usa una pregunta neutral sobre disponibilidad.",
    });
  }
  if (!hasConfirmedOffer()) {
    items.push({
      id: "compensation",
      level: "pending",
      title: "Condiciones de compensación",
      detail: "Sueldo base, comisiones, prestaciones y tipo de contratación sin confirmar; se muestra un mensaje honesto.",
    });
  }
  const aiProvider = env.AI_PROVIDER ?? "none";
  if (aiProvider !== "none" && !(LEGAL.aiProcessingDisclosed && LEGAL.aiProcessingText)) {
    items.push({
      id: "ai-notice",
      level: "blocker",
      title: "Aviso: evaluación con proveedor externo de IA",
      detail:
        "AI_PROVIDER está activo pero el aviso de privacidad aprobado no informa el tratamiento de respuestas por un proveedor externo (aiProcessingText / aiProcessingDisclosed en src/config/legal.ts).",
    });
  }
  if (aiProvider === "none" || !env.ANTHROPIC_API_KEY) {
    items.push({
      id: "ai-provider",
      level: "pending",
      title: "Evaluación con IA sin configurar",
      detail:
        "Las evaluaciones quedan “Pendientes” y el cierre de convocatoria se bloquea hasta evaluarlas o enviarlas a revisión manual (AI_PROVIDER, ANTHROPIC_API_KEY).",
    });
  }
  const provider = env.NOTIFY_PROVIDER ?? "console";
  const recipients = (env.NOTIFY_WHATSAPP_RECIPIENTS ?? "").trim();
  const providerReady =
    (provider === "whatsapp_cloud" &&
      Boolean(env.WHATSAPP_CLOUD_TOKEN && env.WHATSAPP_CLOUD_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE_NAME)) ||
    (provider === "twilio" &&
      Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM));
  const shortlistTemplate =
    (provider === "whatsapp_cloud" && env.WHATSAPP_SHORTLIST_TEMPLATE_NAME) ||
    (provider === "twilio" && env.TWILIO_SHORTLIST_CONTENT_SID);
  if (providerReady && recipients && !shortlistTemplate) {
    items.push({
      id: "shortlist-template",
      level: "pending",
      title: "Plantilla de WhatsApp para la shortlist",
      detail: "Falta la plantilla aprobada del aviso de shortlist (WHATSAPP_SHORTLIST_TEMPLATE_NAME o TWILIO_SHORTLIST_CONTENT_SID).",
    });
  }
  if (!providerReady || !recipients) {
    items.push({
      id: "notifications",
      level: "pending",
      title: "Credenciales del canal de notificación",
      detail:
        "WhatsApp no está configurado. Las notificaciones quedan registradas como pendientes en el panel (NOTIFY_PROVIDER, NOTIFY_WHATSAPP_RECIPIENTS).",
    });
  }

  if (env.APP_ENV === "production") {
    if (!env.APP_URL?.startsWith("https://")) {
      items.push({
        id: "https",
        level: "blocker",
        title: "HTTPS",
        detail: "APP_URL debe usar https:// en producción.",
      });
    }
    if (!env.HASH_SECRET || env.HASH_SECRET.length < 32 || env.HASH_SECRET.startsWith("dev-")) {
      items.push({
        id: "hash-secret",
        level: "blocker",
        title: "Secreto HASH_SECRET",
        detail: "Define un HASH_SECRET aleatorio de al menos 32 caracteres para producción.",
      });
    }
    if ((env.STORAGE_DRIVER ?? "local") === "local" && env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true") {
      items.push({
        id: "storage",
        level: "blocker",
        title: "Almacenamiento privado de CV",
        detail:
          "Configura STORAGE_DRIVER=s3 (bucket privado) o confirma un disco persistente con ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true.",
      });
    }
  }
  return items;
}

export function getLaunchBlockers(env: EnvLike = process.env): LaunchItem[] {
  return getLaunchItems(env).filter((i) => i.level === "blocker");
}
