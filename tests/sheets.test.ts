import { describe, expect, it } from "vitest";
import { applicationSchema } from "@/lib/validation";
import { buildRow, evaluationFields, sheetSafe } from "@/server/sheets";
import { RUBRIC_V1 } from "@/server/evaluation/rubrics/v1";
import { privacyConfig } from "@/config/privacy";
import { loadAppsScript } from "./apps-script/harness";

const SECRET = "x".repeat(32);

const data = applicationSchema.parse({
  submissionKey: "3f1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e",
  contact: { firstName: "=HYPERLINK(\"http://malo\")", lastName: "Pérez", phone: "55 1234 5678", email: "ana@example.com" },
  preferences: { anyAgency: false, agencyFirst: "coapa", agencySecond: "ceda", canCommute: "si", interviewAvailability: ["sabado"], scheduleTalk: "si" },
  experience: { followupExperience: "empezando" },
  interest: { interestVacancy: "Quiero aprender a vender", interestTopics: ["empezando"] },
  challenge: {
    q1: "Le preguntaria para que la va a usar y cuanto quiere gastar",
    q2: "Le digo que lo confirmo con mi gerente y le marco hoy",
    q3: "Le pregunto su presupuesto y le muestro opciones reales",
    q4: "Le mando la ficha y le pregunto si prefiere que le llame despues",
    q5: "Pasale con confianza, aqui estoy si tienes dudas",
    q6: "Ayude a mi vecina a elegir un plan de celular y le funciono",
  },
  consent: { privacyAccepted: true, futureVacancies: true },
  attribution: { utm_source: "facebook", utm_campaign: "asesores" },
});

const meta = { code: "RMX-ABCD-EFGH", receivedAt: new Date("2026-09-29T15:00:00Z"), aiNotice: true, privacyVersion: "aviso-v1" };

const completed = {
  status: "COMPLETED" as const,
  total: 80,
  dimensions: RUBRIC_V1.dimensions.map((d, i) => ({
    id: d.id,
    score: i === 0 ? 4 : 3,
    evidence: "para que la va a usar",
    rationale: "Sólida y aplicable.",
    confidence: "Alto" as const,
    needs_human_review: false,
    review_reason: "",
  })),
  reviewReasons: [],
  provider: "anthropic",
  model: "claude-opus-5",
  rubricVersion: RUBRIC_V1.version,
};

describe("fila para Google Sheets", () => {
  it("incluye contacto, preferencias, las 6 respuestas y consentimiento; neutraliza fórmulas", () => {
    const row = buildRow(data, meta);
    expect(row["Código"]).toBe("RMX-ABCD-EFGH");
    expect(row["Nombre"]).toBe("'=HYPERLINK(\"http://malo\")");
    expect(row["WhatsApp"]).toBe("'+52 55 1234 5678");
    expect(row["Abrir WhatsApp"]).toBe("https://wa.me/525512345678");
    expect(row["Agencia 1"]).toBe("Coapa");
    expect(Object.keys(row).filter((k) => /^P[1-6] /.test(k))).toHaveLength(6);
    expect(row["Estado evaluación"]).toBe("Pendiente");
    expect(row["Futuras vacantes"]).toBe("Sí autoriza");
    expect(row["Origen"]).toBe("facebook · asesores");
    expect(sheetSafe("+5215512345678")).toBe("'+5215512345678");
  });

  it("las columnas de evaluación traen puntaje, desglose por dimensión y evidencia", () => {
    const f = evaluationFields(completed);
    expect(f["Estado evaluación"]).toBe("Evaluada");
    expect(f["Puntaje"]).toBe("80");
    expect(f["Descubrimiento de necesidades (20)"]).toBe("20");
    expect(f["Manejo de objeciones y resolución (20)"]).toBe("15");
    expect(f["Evidencia y justificación"]).toContain("“para que la va a usar”");
    const pending = evaluationFields({ status: "PENDING", error: "Falta ANTHROPIC_API_KEY.", rubricVersion: RUBRIC_V1.version });
    expect(pending["Estado evaluación"]).toBe("Pendiente");
    expect(pending["Puntaje"]).toBe("");
  });
});

describe("Apps Script (Code.gs) con un simulador de Google Sheets", () => {
  it("rechaza peticiones sin el secreto", () => {
    const gs = loadAppsScript(SECRET);
    expect(gs.post({ secret: "otro", action: "append", row: {} })).toEqual({ ok: false, error: "No autorizado" });
  });

  it("agrega la fila, guarda el CV en Drive y no duplica reintentos del mismo envío", () => {
    const gs = loadAppsScript(SECRET);
    const row = buildRow(data, meta);
    const cv = { name: "CV-RMX-ABCD-EFGH.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-1.4").toString("base64") };
    expect(gs.post({ secret: SECRET, action: "append", submissionKey: data.submissionKey, row, cv })).toEqual({ ok: true, code: "RMX-ABCD-EFGH" });
    expect(gs.post({ secret: SECRET, action: "append", submissionKey: data.submissionKey, row, cv })).toEqual({
      ok: true,
      code: "RMX-ABCD-EFGH",
      duplicateSubmission: true,
    });
    const sheet = gs.sheet("Postulaciones")!;
    const records = sheet.records();
    expect(records).toHaveLength(1);
    expect(records[0]!["CV"]).toMatch(/^https:\/\/drive\.google\.com\//);
    expect(gs.files).toEqual([{ name: "CV-RMX-ABCD-EFGH.pdf", mime: "application/pdf", bytes: 8 }]);
    // El script vuelve a proteger contra fórmulas aunque el texto llegue sin protección.
    gs.post({ secret: SECRET, action: "append", submissionKey: "otra-clave", row: { ...row, Código: "RMX-2222-3333", Nombre: "=IMPORTXML(1)" } });
    expect(sheet.rawAppends[1]).toContain("'=IMPORTXML(1)");
    expect(sheet.records()[1]!["Posible duplicado"]).toBe("Sí");
  });

  it("escribe la evaluación en la fila y arma el Top con umbral, tamaño y empates", () => {
    const gs = loadAppsScript(SECRET);
    gs.post({ secret: SECRET, action: "append", submissionKey: "k1", row: buildRow(data, meta) });
    expect(gs.post({ secret: SECRET, action: "evaluation", code: "RMX-ABCD-EFGH", fields: evaluationFields(completed) })).toEqual({ ok: true });
    expect(gs.post({ secret: SECRET, action: "evaluation", code: "RMX-NOPE-NOPE", fields: {} })).toEqual({ ok: false, error: "Código no encontrado" });

    const rec = gs.sheet("Postulaciones")!.records()[0]!;
    expect(rec["Estado evaluación"]).toBe("Evaluada");
    expect(rec["Puntaje"]).toBe(80); // número, para que la fórmula del Top pueda compararlo

    const config = gs.sheet("Config")!;
    expect(config.getRange("B1").getValue()).toBe(70);
    expect(config.getRange("B2").getValue()).toBe(5);

    const top = gs.sheet("Top 5")!;
    const table = top.formulas.get("6,1")!;
    const headers = gs.sheet("Postulaciones")!.grid[0]!;
    const letter = (name: string) => {
      let n = headers.indexOf(name) + 1;
      let out = "";
      while (n > 0) {
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
        n = Math.floor((n - 1) / 26);
      }
      return out;
    };
    expect(table).toContain(`'Postulaciones'!${letter("Puntaje")}2:${letter("Puntaje")}`);
    expect(table).toContain(`'Postulaciones'!${letter("Estado evaluación")}2:`);
    expect(table).toContain('(est="Evaluada")');
    expect(table).toContain("LARGE(FILTER(pts,ok),n)"); // corte en el lugar N: incluye empatados
    expect(top.formulas.get("2,1")).toContain("Empate en el último lugar");
    expect(top.formulas.get("3,1")).toContain("Revisión manual");
    expect(top.grid[4]).toEqual(expect.arrayContaining(["Código", "Nombre", "Puntaje", "Evidencia y justificación", "CV"]));
    // Paréntesis balanceados en las fórmulas generadas.
    for (const f of top.formulas.values()) {
      expect([...f].filter((c) => c === "(").length).toBe([...f].filter((c) => c === ")").length);
    }
  });
});

describe("aviso de privacidad en modo simple", () => {
  it("bloquea el registro hasta tener los 4 datos del responsable", () => {
    const p = privacyConfig({ DATA_BACKEND: "sheets", RIDERMEX_RESPONSABLE: "Motos X SA de CV" });
    expect(p.complete).toBe(false);
    expect(p.missing).toHaveLength(3);
  });

  it("con los datos completos informa proveedores reales, incluido el de IA si está activo", () => {
    const p = privacyConfig({
      DATA_BACKEND: "sheets",
      RIDERMEX_RESPONSABLE: "Motos X SA de CV",
      RIDERMEX_DOMICILIO: "Calle 1, CDMX",
      RIDERMEX_CORREO_PRIVACIDAD: "privacidad@example.com",
      RIDERMEX_PLAZO_CONSERVACION: "12 meses",
      AI_PROVIDER: "anthropic",
    });
    expect(p.complete).toBe(true);
    expect(p.transfersText).toContain("Google LLC");
    expect(p.transfersText).toContain("Anthropic");
    expect(p.arcoProcedure).toContain("privacidad@example.com");
  });
});
