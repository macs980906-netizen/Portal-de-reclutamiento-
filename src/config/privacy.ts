import { LEGAL, type LegalConfig } from "./legal";

type EnvLike = Record<string, string | undefined>;

/**
 * Aviso de privacidad efectivo.
 *
 * - Modo `postgres`: usa `src/config/legal.ts` tal cual.
 * - Modo `sheets` (landing en Vercel + Google Sheets): RiderMex captura 4 datos por variables de
 *   entorno (responsable, domicilio, correo de privacidad y plazo de conservación). El resto del
 *   aviso describe lo que el sistema realmente hace (proveedores que intervienen y cómo ejercer
 *   derechos). Es un mínimo operativo: debe validarlo su asesoría legal.
 *
 * Sin esos 4 datos el formulario no acepta postulaciones.
 */
export type PrivacyConfig = LegalConfig & { complete: boolean; missing: string[]; sheetsMode: boolean };

export const REQUIRED_PRIVACY_ENV = {
  RIDERMEX_RESPONSABLE: "Nombre o razón social del responsable",
  RIDERMEX_DOMICILIO: "Domicilio del responsable",
  RIDERMEX_CORREO_PRIVACIDAD: "Correo para privacidad y derechos ARCO",
  RIDERMEX_PLAZO_CONSERVACION: "Plazo de conservación de las postulaciones",
} as const;

export function privacyConfig(env: EnvLike = process.env): PrivacyConfig {
  const sheetsMode = env.DATA_BACKEND === "sheets";
  if (!sheetsMode) {
    const complete = Boolean(
      LEGAL.controllerName && LEGAL.controllerAddress && LEGAL.arcoContact && LEGAL.fullNoticeApproved && LEGAL.retentionText,
    );
    return { ...LEGAL, complete, missing: [], sheetsMode };
  }

  const missing = Object.entries(REQUIRED_PRIVACY_ENV)
    .filter(([k]) => !env[k]?.trim())
    .map(([, label]) => label);
  const contact = env.RIDERMEX_CORREO_PRIVACIDAD?.trim() || null;
  const ai = (env.AI_PROVIDER ?? "none") !== "none";
  const providers = [
    "Vercel Inc. (hospedaje del sitio)",
    "Google LLC (Google Sheets y Google Drive, donde se guardan las postulaciones y, en su caso, el CV)",
    ai ? "Anthropic PBC (evaluación asistida de las respuestas del desafío, sin nombre, teléfono, correo ni CV)" : null,
  ].filter(Boolean);

  return {
    ...LEGAL,
    sheetsMode,
    complete: missing.length === 0,
    missing,
    controllerName: env.RIDERMEX_RESPONSABLE?.trim() || null,
    controllerAddress: env.RIDERMEX_DOMICILIO?.trim() || null,
    arcoContact: contact,
    arcoProcedure: contact
      ? `Envía un correo a ${contact} con tu nombre completo, tu código de postulación (RMX-…) y el derecho que deseas ejercer o el consentimiento que deseas revocar. Te responderemos por el mismo medio.`
      : null,
    limitUseMechanism: contact ? `Puedes solicitar limitar el uso o la divulgación de tus datos escribiendo a ${contact}.` : null,
    retentionText: env.RIDERMEX_PLAZO_CONSERVACION?.trim() || null,
    transfersText: `No vendemos ni compartimos tus datos con terceros para fines propios de ellos. Para operar este proceso intervienen como proveedores (encargados): ${providers.join("; ")}.`,
    changesMechanism: "Cualquier cambio a este aviso se publicará en esta misma página.",
    aiProcessingText: ai
      ? "Las respuestas del desafío (sin datos de identificación) se procesan con Anthropic PBC para obtener una evaluación orientativa según una rúbrica; el resultado siempre lo revisa una persona del equipo."
      : null,
    aiProcessingDisclosed: ai,
    fullNoticeApproved: missing.length === 0,
    noticeVersion: env.RIDERMEX_AVISO_VERSION?.trim() || "aviso-reclutamiento-v1",
    noticeUpdatedAt: env.RIDERMEX_AVISO_FECHA?.trim() || null,
  };
}
