import { describe, expect, it } from "vitest";
import { applicationSchema, attributionSchema, contactSchema, normalizeMxPhone, preferencesSchema } from "@/lib/validation";

const valid = {
  submissionKey: "3f1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
  contact: { firstName: "Ana", lastName: "Pérez", phone: "55 1234 5678" },
  preferences: { anyAgency: false, agencyFirst: "coapa", canCommute: "si", interviewAvailability: ["sabado"], scheduleTalk: "si" },
  experience: { helpedDecideStory: "Ayudé a un cliente a elegir un plan de celular según su uso.", followupExperience: "empezando" },
  interest: { interestVacancy: "Quiero aprender a vender", interestTopics: ["empezando"] },
  challenge: { q1: "q1_b", q2: "q2_c", q3: "q3_d", q4: "q4_c", q5: "Hola, bienvenido, ¿en qué te ayudo?" },
  consent: { privacyAccepted: true, futureVacancies: false },
};

describe("validación de la postulación", () => {
  it("acepta una postulación completa sin CV ni correo", () => {
    const r = applicationSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contact.phone).toBe("5512345678");
  });

  it("normaliza celulares mexicanos y rechaza formatos inválidos", () => {
    expect(normalizeMxPhone("+52 1 55 1234 5678")).toBe("5512345678");
    expect(normalizeMxPhone("52 55-1234-5678")).toBe("5512345678");
    expect(normalizeMxPhone("12345")).toBeNull();
    expect(normalizeMxPhone("0512345678")).toBeNull();
  });

  it("valida el formato del correo sólo si se proporciona", () => {
    expect(contactSchema.safeParse({ ...valid.contact, email: "" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid.contact, email: "no-es-correo" }).success).toBe(false);
  });

  it("rechaza campos no previstos (asignación masiva)", () => {
    const r = applicationSchema.safeParse({ ...valid, contact: { ...valid.contact, status: "CONTRATADO" } });
    expect(r.success).toBe(false);
    const r2 = applicationSchema.safeParse({ ...valid, scoreTotal: 100 });
    expect(r2.success).toBe(false);
  });

  it("exige primera agencia salvo que acepte cualquiera, y la segunda debe ser distinta", () => {
    const base = valid.preferences;
    expect(preferencesSchema.safeParse({ ...base, agencyFirst: undefined }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, agencyFirst: undefined, anyAgency: true }).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...base, agencySecond: "coapa" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, agencyFirst: "sucursal-en-preparacion" }).success).toBe(false);
  });

  it("sin horario confirmado, pide la pregunta neutral sobre el horario", () => {
    expect(preferencesSchema.safeParse({ ...valid.preferences, scheduleTalk: undefined }).success).toBe(false);
  });

  it("no permite enviar sin aceptar el aviso; el consentimiento de futuras vacantes es opcional", () => {
    expect(applicationSchema.safeParse({ ...valid, consent: { privacyAccepted: false, futureVacancies: true } }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...valid, consent: { privacyAccepted: true } }).success).toBe(true);
  });

  it("rechaza opciones del desafío inexistentes", () => {
    expect(applicationSchema.safeParse({ ...valid, challenge: { ...valid.challenge, q1: "q2_c" } }).success).toBe(false);
  });

  it("limpia la atribución: descarta valores extraños y quita la query del referrer", () => {
    const r = attributionSchema.parse({
      utm_source: "facebook",
      utm_campaign: "<script>alert(1)</script>",
      referrer: "https://l.facebook.com/l.php?u=https%3A%2F%2Fx&email=ana@example.com",
    });
    expect(r.utm_source).toBe("facebook");
    expect(r.utm_campaign).toBeUndefined();
    expect(r.referrer).toBe("https://l.facebook.com/l.php");
  });
});
