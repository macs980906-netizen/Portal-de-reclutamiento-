import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  HASH_SECRET: z.string().min(16, "HASH_SECRET debe tener al menos 16 caracteres"),
  TRUST_PROXY_HEADERS: z.enum(["true", "false"]).default("false"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/private"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  CV_MAX_MB: z.coerce.number().positive().max(20).default(5),

  NOTIFY_PROVIDER: z.enum(["console", "whatsapp_cloud", "twilio", "none"]).default("console"),
  NOTIFY_WHATSAPP_RECIPIENTS: z.string().default(""),
  WHATSAPP_CLOUD_TOKEN: z.string().optional(),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CLOUD_API_VERSION: z.string().default("v21.0"),
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default("es_MX"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_CONTENT_SID: z.string().optional(),
  TWILIO_SHORTLIST_CONTENT_SID: z.string().optional(),
  WHATSAPP_SHORTLIST_TEMPLATE_NAME: z.string().optional(),
  /** Aviso por cada postulación nueva (además del aviso de shortlist al cerrar). */
  NOTIFY_EACH_APPLICATION: z.enum(["true", "false"]).default("true"),

  // Correo de respaldo (SMTP)
  NOTIFY_EMAIL_RECIPIENTS: z.string().default(""),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Evaluación asistida por IA
  AI_PROVIDER: z.enum(["none", "anthropic"]).default("none"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Variables de entorno validadas. Nunca se exponen al navegador (sin prefijo NEXT_PUBLIC_). */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Configuración inválida: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => env().APP_ENV === "production";

/** Sólo para pruebas: vuelve a leer process.env en la siguiente llamada. */
export function resetEnvCache() {
  cached = null;
}
