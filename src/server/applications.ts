import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { applicationCode, hmac, sha256 } from "./crypto";
import { newStorageKey, storage } from "./storage";
import type { CvKind } from "./file-validation";
import { scoreApplication } from "./scoring/score";
import { LEGAL } from "@/config/legal";
import { DEFAULT_STATUS } from "@/config/statuses";
import type { ApplicationData } from "@/lib/validation";

const DUPLICATE_WINDOW_DAYS = 30;

export type CvUpload = { bytes: Uint8Array; kind: CvKind; displayName: string };

export type CreateResult = { id: string; code: string; notify: boolean };

/**
 * Crea el expediente. Idempotente por `submissionKey`: un reintento del mismo envío
 * devuelve el mismo código sin crear otro registro. Si el teléfono o correo ya
 * enviaron una postulación recientemente, se guarda marcada como posible duplicado
 * (sin avisar a la persona ni notificar de nuevo al equipo).
 */
export async function createApplication(data: ApplicationData, cv: CvUpload | null): Promise<CreateResult> {
  const existing = await prisma.application.findUnique({
    where: { submissionKey: data.submissionKey },
    select: { id: true, code: true },
  });
  if (existing) return { ...existing, notify: false };

  const phoneHash = hmac(`phone:${data.contact.phone}`);
  const emailHash = data.contact.email ? hmac(`email:${data.contact.email}`) : null;
  const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86_400_000);
  const duplicate = await prisma.application.findFirst({
    where: {
      createdAt: { gte: since },
      OR: [{ phoneHash }, ...(emailHash ? [{ emailHash }] : [])],
    },
    select: { id: true },
  });

  const score = scoreApplication({
    challenge: data.challenge,
    interestVacancy: data.interest.interestVacancy,
    interestDetail: data.interest.interestDetail,
  });

  let storageKey: string | null = null;
  if (cv) {
    storageKey = newStorageKey(cv.kind.ext);
    await storage().put(storageKey, cv.bytes, cv.kind.mime);
  }

  const { contact, preferences: pref, experience: exp, interest, challenge, consent, attribution } = data;
  const hasAttribution = attribution && Object.values(attribution).some(Boolean);

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = applicationCode();
    try {
      const created = await prisma.application.create({
        data: {
          code,
          submissionKey: data.submissionKey,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          email: contact.email ?? null,
          phoneHash,
          emailHash,
          agencyFirst: pref.agencyFirst ?? null,
          agencySecond: pref.agencySecond ?? null,
          anyAgency: pref.anyAgency,
          generalArea: pref.generalArea ?? null,
          canCommute: pref.canCommute,
          interviewAvailability: pref.interviewAvailability,
          scheduleTalk: pref.scheduleTalk ?? null,
          scheduleAcknowledged: pref.scheduleAcknowledged ?? null,
          productsSold: exp.productsSold ?? null,
          helpedDecideStory: exp.helpedDecideStory,
          followupExperience: exp.followupExperience,
          followupDetail: exp.followupDetail ?? null,
          yearsExperience: exp.yearsExperience ?? null,
          vehicleSalesExperience: exp.vehicleSalesExperience ?? null,
          interestVacancy: interest.interestVacancy,
          interestTopics: interest.interestTopics,
          interestDetail: interest.interestDetail ?? null,
          challengeAnswers: challenge,
          scoreTotal: score.total,
          scoreBreakdown: score.breakdown,
          scoreIndicators: score.indicators,
          scoringVersion: score.version,
          status: DEFAULT_STATUS,
          possibleDuplicate: Boolean(duplicate),
          privacyNoticeVersion: LEGAL.noticeVersion,
          privacyAcceptedAt: new Date(),
          futureVacanciesConsent: consent.futureVacancies,
          cv:
            cv && storageKey
              ? {
                  create: {
                    storageKey,
                    originalName: cv.displayName,
                    mimeType: cv.kind.mime,
                    sizeBytes: cv.bytes.byteLength,
                    sha256: sha256(Buffer.from(cv.bytes)),
                  },
                }
              : undefined,
          attribution: hasAttribution
            ? {
                create: {
                  utmSource: attribution.utm_source ?? null,
                  utmMedium: attribution.utm_medium ?? null,
                  utmCampaign: attribution.utm_campaign ?? null,
                  utmContent: attribution.utm_content ?? null,
                  utmTerm: attribution.utm_term ?? null,
                  referrer: attribution.referrer ?? null,
                },
              }
            : undefined,
          events: { create: { type: "CREATED", toValue: DEFAULT_STATUS } },
        },
        select: { id: true, code: true },
      });
      return { ...created, notify: !duplicate };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = String((err.meta as { target?: unknown })?.target ?? "");
        if (target.includes("submissionKey")) {
          if (storageKey) await storage().delete(storageKey).catch(() => {});
          const again = await prisma.application.findUnique({
            where: { submissionKey: data.submissionKey },
            select: { id: true, code: true },
          });
          if (again) return { ...again, notify: false };
        }
        if (target.includes("code")) continue; // colisión de código (muy improbable): reintentar
      }
      if (storageKey) await storage().delete(storageKey).catch(() => {});
      throw err;
    }
  }
  if (storageKey) await storage().delete(storageKey).catch(() => {});
  throw new Error("No se pudo generar un código único");
}

/** Borrado completo de un expediente (p. ej. solicitud ARCO de cancelación o retención). */
export async function deleteApplication(id: string): Promise<boolean> {
  const app = await prisma.application.findUnique({ where: { id }, include: { cv: true } });
  if (!app) return false;
  if (app.cv) await storage().delete(app.cv.storageKey);
  await prisma.application.delete({ where: { id } });
  return true;
}
