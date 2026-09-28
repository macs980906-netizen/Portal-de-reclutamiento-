import { z } from "zod";
import { AGENCY_IDS } from "@/config/agencies";
import { BUSINESS } from "@/config/business";
import { CHALLENGE } from "./challenge";
import {
  COMMUTE_OPTIONS,
  FOLLOWUP_OPTIONS,
  INTEREST_TOPIC_OPTIONS,
  INTERVIEW_AVAILABILITY_OPTIONS,
  SCHEDULE_TALK_OPTIONS,
  VEHICLE_EXPERIENCE_OPTIONS,
  YEARS_OPTIONS,
  ids,
} from "./form-options";

/**
 * Esquemas de validación compartidos por el navegador (mensajes inmediatos) y el
 * servidor (fuente de verdad). Sólo se aceptan campos conocidos: `.strict()` evita
 * asignación masiva de propiedades no previstas.
 */

// Quita caracteres de control (excepto saltos de línea) y espacios sobrantes.
const clean = (s: string) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();

const text = (min: number, max: number, requiredMsg: string) =>
  z
    .string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
    .transform(clean)
    .pipe(
      z
        .string()
        .min(min, min <= 1 ? requiredMsg : `Escribe al menos ${min} caracteres.`)
        .max(max, `Máximo ${max} caracteres.`),
    );

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : clean(v)))
    .pipe(z.string().max(max, `Máximo ${max} caracteres.`).optional())
    .transform((v) => (v ? v : undefined));

/** Normaliza un celular mexicano a 10 dígitos. Devuelve `null` si no es válido. */
export function normalizeMxPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("521")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
  return /^[1-9]\d{9}$/.test(digits) ? digits : null;
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const contactSchema = z
  .object({
    firstName: text(1, 60, "Escribe tu nombre."),
    lastName: text(1, 80, "Escribe tu apellido."),
    phone: z
      .string({ required_error: "Escribe tu número de celular." })
      .transform((v, ctx) => {
        const n = normalizeMxPhone(v);
        if (!n) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Escribe un celular de 10 dígitos, por ejemplo 55 1234 5678.",
          });
          return z.NEVER;
        }
        return n;
      }),
    email: z
      .string()
      .optional()
      .transform((v) => (v ? normalizeEmail(v) : undefined))
      .pipe(z.string().email("Revisa el formato del correo, por ejemplo nombre@correo.com.").max(120).optional()),
  })
  .strict();

export const scheduleConfirmed = () => Boolean(BUSINESS.jobSchedule);

export const preferencesSchema = z
  .object({
    anyAgency: z.boolean().default(false),
    agencyFirst: z.enum(AGENCY_IDS).optional(),
    agencySecond: z.enum(AGENCY_IDS).optional(),
    generalArea: optionalText(80),
    canCommute: z.enum(ids(COMMUTE_OPTIONS), { errorMap: () => ({ message: "Elige una opción." }) }),
    interviewAvailability: z
      .array(z.enum(ids(INTERVIEW_AVAILABILITY_OPTIONS)))
      .min(1, "Elige al menos una opción.")
      .max(INTERVIEW_AVAILABILITY_OPTIONS.length),
    scheduleTalk: z.enum(ids(SCHEDULE_TALK_OPTIONS)).optional(),
    scheduleAcknowledged: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.anyAgency && !v.agencyFirst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agencyFirst"],
        message: "Elige tu primera opción o marca que te interesa cualquier agencia.",
      });
    }
    if (v.agencySecond && v.agencySecond === v.agencyFirst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agencySecond"],
        message: "La segunda opción debe ser distinta de la primera.",
      });
    }
    if (scheduleConfirmed()) {
      if (v.scheduleAcknowledged !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scheduleAcknowledged"],
          message: "Confirma que revisaste el horario del puesto.",
        });
      }
    } else if (!v.scheduleTalk) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleTalk"], message: "Elige una opción." });
    }
  });

export const experienceSchema = z
  .object({
    productsSold: optionalText(300),
    followupExperience: z.enum(ids(FOLLOWUP_OPTIONS), { errorMap: () => ({ message: "Elige una opción." }) }),
    followupDetail: optionalText(600),
    yearsExperience: z.enum(ids(YEARS_OPTIONS)).optional(),
    vehicleSalesExperience: z.enum(ids(VEHICLE_EXPERIENCE_OPTIONS)).optional(),
  })
  .strict();

export const interestSchema = z
  .object({
    interestVacancy: text(10, 1000, "Cuéntanos qué te interesa de la vacante."),
    interestTopics: z
      .array(z.enum(ids(INTEREST_TOPIC_OPTIONS)))
      .min(1, "Elige al menos una opción.")
      .max(INTEREST_TOPIC_OPTIONS.length),
    interestDetail: optionalText(600),
  })
  .strict();

const answer = (qid: (typeof CHALLENGE)[number]["id"]) => {
  const q = CHALLENGE.find((c) => c.id === qid)!;
  return text(q.minLength, q.maxLength, "Escribe tu respuesta, aunque sea breve.");
};

export const challengeSchema = z
  .object({
    q1: answer("q1"),
    q2: answer("q2"),
    q3: answer("q3"),
    q4: answer("q4"),
    q5: answer("q5"),
    q6: answer("q6"),
  })
  .strict();

export const consentSchema = z
  .object({
    privacyAccepted: z.literal(true, {
      errorMap: () => ({ message: "Para enviar tu postulación necesitas aceptar el aviso de privacidad." }),
    }),
    futureVacancies: z.boolean().default(false),
  })
  .strict();

const utmValue = z
  .string()
  .optional()
  .transform((v) => (v ? clean(v).slice(0, 150) : undefined))
  .transform((v) => (v && /^[\p{L}\p{N} ._\-+:/|]+$/u.test(v) ? v : undefined));

export const attributionSchema = z
  .object({
    utm_source: utmValue,
    utm_medium: utmValue,
    utm_campaign: utmValue,
    utm_content: utmValue,
    utm_term: utmValue,
    referrer: z
      .string()
      .optional()
      .transform((v) => {
        if (!v) return undefined;
        try {
          const u = new URL(v);
          if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
          // Sólo origen + ruta: se descartan query strings que podrían contener datos personales.
          return `${u.origin}${u.pathname}`.slice(0, 300);
        } catch {
          return undefined;
        }
      }),
  })
  .strict()
  .partial();

export const applicationSchema = z
  .object({
    submissionKey: z.string().uuid(),
    contact: contactSchema,
    preferences: preferencesSchema,
    experience: experienceSchema,
    interest: interestSchema,
    challenge: challengeSchema,
    consent: consentSchema,
    attribution: attributionSchema.optional(),
  })
  .strict();

export type ApplicationInput = z.input<typeof applicationSchema>;
export type ApplicationData = z.output<typeof applicationSchema>;

export const STEP_SCHEMAS = {
  contact: contactSchema,
  preferences: preferencesSchema,
  experience: experienceSchema,
  interest: interestSchema,
  challenge: challengeSchema,
  consent: consentSchema,
} as const;

/** Convierte errores de zod en `{ "ruta.campo": "mensaje" }` para mostrarlos junto a cada campo. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
