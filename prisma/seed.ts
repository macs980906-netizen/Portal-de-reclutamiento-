/**
 * Datos DEMO sólo para desarrollo. Nunca se ejecuta con APP_ENV=production.
 *
 * Crea dos cuentas de prueba, una convocatoria abierta y postulaciones ficticias
 * (correos @example.com, teléfonos 55 0000 00xx). Las evaluaciones demo se marcan como
 * MANUALES y su justificación empieza con "[DEMO]": no simulan una evaluación de IA.
 * Algunas quedan "Pendientes" para mostrar el bloqueo del cierre.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { applicationCode, hmac } from "../src/server/crypto";
import { LEGAL } from "../src/config/legal";
import { QUESTION_SET_VERSION } from "../src/lib/challenge";
import { RUBRIC_V1 } from "../src/server/evaluation/rubrics/v1";
import { toPoints, weightsOf } from "../src/server/evaluation/scoring";

if (process.env.APP_ENV === "production") {
  console.error("✖ El seed de demostración no se ejecuta en producción.");
  process.exit(1);
}

const prisma = new PrismaClient();
const DEMO_PASSWORD = "demo-ridermex-2026";

const PEOPLE = [
  ["Mariana", "López"], ["Jorge", "Hernández"], ["Daniela", "Ruiz"], ["Luis", "Martínez"],
  ["Fernanda", "Cruz"], ["Ricardo", "Sánchez"], ["Paola", "Gómez"], ["Iván", "Torres"],
  ["Karla", "Díaz"], ["Omar", "Flores"], ["Alejandra", "Reyes"], ["Tomás", "Morales"],
] as const;
const AGENCIES = ["naucalpan", "ceda", "coapa", "chalco"];

const ANSWERS = {
  q1: "Le preguntaría para qué la va a usar, si para trabajo o para pasear, cuánto quiere invertir y si ya ha manejado moto.",
  q2: "Le diría que no tengo el dato exacto pero que lo confirmo en la ficha o con mi gerente y le marco hoy mismo con la información correcta.",
  q3: "Le preguntaría qué presupuesto tenía pensado y qué es lo que más le importa, y le mostraría opciones reales que le queden.",
  q4: "Le mandaría un mensaje corto: hola, te comparto la ficha que me pediste, ¿prefieres que te llame la próxima semana?",
  q5: "¡Claro! Pásale con confianza, si te surge alguna duda aquí estoy para ayudarte.",
  q6: "En la tienda de mi tía una señora no sabía qué celular llevar; le pregunté cómo lo usaba y le recomendé uno más barato que le funcionó. Regresó con su hija.",
};

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    create: { email: "admin@demo.local", name: "Admin Demo", role: "ADMIN", passwordHash },
    update: { passwordHash, active: true },
  });
  await prisma.user.upsert({
    where: { email: "revisor@demo.local" },
    create: { email: "revisor@demo.local", name: "Revisor Demo", role: "REVIEWER", passwordHash },
    update: { passwordHash, active: true },
  });

  if (await prisma.recruitmentCycle.count()) {
    console.log("Ya hay convocatorias; no se agregan más datos demo.");
    return;
  }
  const cycle = await prisma.recruitmentCycle.create({
    data: {
      name: "DEMO · Asesores octubre 2026",
      startsAt: new Date(Date.now() - 7 * 86_400_000),
      rubricVersion: RUBRIC_V1.version,
      eligibilityVersion: RUBRIC_V1.eligibility.version,
      createdById: admin.id,
    },
  });

  const weights = weightsOf(RUBRIC_V1);
  for (const [i, [firstName, lastName]] of PEOPLE.entries()) {
    const phone = `55000000${String(i + 10).padStart(2, "0")}`;
    const email = `demo${i + 1}@example.com`;
    const pending = i >= 10; // dos quedan pendientes para mostrar el bloqueo de cierre
    const scores = RUBRIC_V1.dimensions.map((d, j) => ({ id: d.id, score: Math.max(1, 4 - ((i + j) % 4)) }));
    const dims = scores.map((s) => ({
      ...s,
      evidence: "",
      rationale: "[DEMO] Calificación ficticia para probar el panel.",
      confidence: "Alto" as const,
      needs_human_review: false,
      review_reason: "",
    }));
    const { total } = toPoints(dims, weights);
    await prisma.application.create({
      data: {
        code: applicationCode(),
        submissionKey: randomUUID(),
        firstName,
        lastName,
        phone,
        email,
        phoneHash: hmac(`phone:${phone}`),
        emailHash: hmac(`email:${email}`),
        agencyFirst: i % 5 === 0 ? null : AGENCIES[i % 4],
        agencySecond: i % 2 ? AGENCIES[(i + 1) % 4] : null,
        anyAgency: i % 5 === 0,
        canCommute: "si",
        interviewAvailability: i % 2 ? ["semana_manana", "sabado"] : ["flexible"],
        scheduleTalk: "si",
        followupExperience: ["empezando", "ocasional", "regular"][i % 3]!,
        vehicleSalesExperience: ["no", "no", "motos", "autos"][i % 4],
        interestVacancy: "Me gusta platicar con la gente y quiero crecer en ventas.",
        interestTopics: ["ventas", "motos"],
        challengeAnswers: ANSWERS,
        questionSetVersion: QUESTION_SET_VERSION,
        rubricVersion: RUBRIC_V1.version,
        cycleId: cycle.id,
        scoreTotal: pending ? null : total,
        privacyNoticeVersion: LEGAL.noticeVersion,
        privacyAcceptedAt: new Date(),
        futureVacanciesConsent: i % 2 === 0,
        createdAt: new Date(Date.now() - i * 7 * 3600_000),
        events: { create: { type: "CREATED", toValue: "NUEVO" } },
        evaluations: {
          create: pending
            ? { rubricVersion: RUBRIC_V1.version, questionSetVersion: QUESTION_SET_VERSION, status: "PENDING", lastError: "Falta ANTHROPIC_API_KEY." }
            : {
                rubricVersion: RUBRIC_V1.version,
                questionSetVersion: QUESTION_SET_VERSION,
                status: "COMPLETED",
                source: "MANUAL",
                dimensions: dims,
                weights,
                total,
                completedAt: new Date(),
                reviewedById: admin.id,
                reviewedAt: new Date(),
              },
        },
      },
    });
  }
  console.log(`✔ Datos demo creados. Cuentas: admin@demo.local / revisor@demo.local · contraseña: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
