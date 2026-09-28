/**
 * Datos DEMO sólo para desarrollo. Nunca se ejecuta con APP_ENV=production.
 * Crea dos cuentas de prueba y postulaciones ficticias (correos @example.com,
 * teléfonos 55 0000 00xx). Ejecutar: `npm run db:seed`.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { scoreApplication } from "../src/server/scoring/score";
import { applicationCode, hmac } from "../src/server/crypto";
import { LEGAL } from "../src/config/legal";
import { STATUSES } from "../src/config/statuses";

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
const Q = { q1: ["q1_a", "q1_b", "q1_c", "q1_d", "q1_u"], q2: ["q2_a", "q2_b", "q2_c", "q2_d", "q2_u"], q3: ["q3_a", "q3_b", "q3_c", "q3_d", "q3_u"], q4: ["q4_a", "q4_b", "q4_c", "q4_d", "q4_u"] };
const OPENERS = [
  "¡Hola, bienvenido! Claro, con calma. ¿Buscas algo para trabajar o para pasear? Así te puedo orientar mejor.",
  "Buenas tardes, adelante, sin compromiso. Si te surge alguna duda aquí estoy para ayudarte.",
  "Ok, cualquier cosa me dices.",
  "Hola, qué gusto que nos visites. ¿Ya tienes alguna moto en mente o quieres que te muestre las opciones?",
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    create: { email: "admin@demo.local", name: "Admin Demo", role: "ADMIN", passwordHash },
    update: { passwordHash, active: true },
  });
  await prisma.user.upsert({
    where: { email: "revisor@demo.local" },
    create: { email: "revisor@demo.local", name: "Revisor Demo", role: "REVIEWER", passwordHash },
    update: { passwordHash, active: true },
  });

  const existing = await prisma.application.count();
  if (existing > 0) {
    console.log(`Ya hay ${existing} postulaciones; no se agregan más datos demo.`);
    return;
  }

  for (const [i, [firstName, lastName]] of PEOPLE.entries()) {
    const pick = <T,>(arr: readonly T[], offset = 0) => arr[(i * 3 + offset) % arr.length]!;
    const challenge = { q1: pick(Q.q1, 1), q2: pick(Q.q2, 2), q3: pick(Q.q3, 3), q4: pick(Q.q4, 2), q5: pick(OPENERS) };
    const interestVacancy = "Me gusta platicar con la gente y quiero crecer en ventas.";
    const score = scoreApplication({ challenge, interestVacancy });
    const phone = `55000000${String(i + 10).padStart(2, "0")}`;
    const email = `demo${i + 1}@example.com`;
    const anyAgency = i % 5 === 0;
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
        agencyFirst: anyAgency ? null : pick(AGENCIES),
        agencySecond: i % 2 ? pick(AGENCIES, 1) : null,
        anyAgency,
        generalArea: i % 3 ? "Iztapalapa" : null,
        canCommute: "si",
        interviewAvailability: i % 2 ? ["semana_manana", "sabado"] : ["flexible"],
        scheduleTalk: "si",
        productsSold: i % 4 ? "Celulares y accesorios" : null,
        helpedDecideStory: "Una clienta no sabía qué plan elegir; le pregunté cómo usaba su teléfono y le recomendé uno más barato que le funcionó.",
        followupExperience: pick(["empezando", "ocasional", "regular"]),
        yearsExperience: pick(["ninguna", "menos_1", "1_3", "mas_3"]),
        vehicleSalesExperience: pick(["no", "no", "motos", "autos"]),
        interestVacancy,
        interestTopics: ["ventas", "motos"],
        challengeAnswers: challenge,
        scoreTotal: score.total,
        scoreBreakdown: score.breakdown,
        scoreIndicators: score.indicators,
        scoringVersion: score.version,
        status: pick(STATUSES.map((s) => s.id), 0),
        privacyNoticeVersion: LEGAL.noticeVersion,
        privacyAcceptedAt: new Date(),
        futureVacanciesConsent: i % 2 === 0,
        createdAt: new Date(Date.now() - i * 7 * 3600_000),
        attribution: i % 2 ? { create: { utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "asesores-demo" } } : undefined,
        events: { create: { type: "CREATED", toValue: "NUEVO" } },
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
