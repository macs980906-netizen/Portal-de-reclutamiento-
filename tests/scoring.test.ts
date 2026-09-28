import { describe, expect, it } from "vitest";
import { scoreApplication } from "@/server/scoring/score";
import { CHOICE_KEY, WEIGHTS } from "@/server/scoring/key";
import { CHOICE_QUESTIONS } from "@/lib/challenge";

const best = {
  q1: "q1_b",
  q2: "q2_c",
  q3: "q3_d",
  q4: "q4_c",
  q5: "¡Hola, bienvenido! Con calma, sin compromiso. ¿Buscas moto para trabajar o para pasear? Así te puedo orientar mejor.",
};
const interest = "Me interesa aprender a vender motos y atender clientes";

describe("puntaje orientativo", () => {
  it("los pesos suman 100 y respetan la estructura acordada", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(WEIGHTS).toEqual({ discovery: 25, honesty: 20, empathy: 20, followup: 15, communication: 10, learning: 10 });
  });

  it("la clave cubre exactamente las opciones públicas de cada pregunta", () => {
    for (const q of CHOICE_QUESTIONS) {
      expect(Object.keys(CHOICE_KEY[q.id]!).sort()).toEqual(q.options.map((o) => o.id).sort());
    }
  });

  it("es determinista: la misma respuesta produce el mismo resultado", () => {
    const a = scoreApplication({ challenge: best, interestVacancy: interest });
    const b = scoreApplication({ challenge: { ...best }, interestVacancy: interest });
    expect(a).toEqual(b);
  });

  it("las mejores respuestas alcanzan 100 y el desglose no excede cada peso", () => {
    const r = scoreApplication({ challenge: best, interestVacancy: interest });
    expect(r.total).toBe(100);
    for (const d of r.breakdown) expect(d.score).toBeLessThanOrEqual(d.max);
  });

  it("inventar datos, presionar y engañar puntúa claramente por debajo", () => {
    const worst = scoreApplication({
      challenge: { q1: "q1_c", q2: "q2_a", q3: "q3_c", q4: "q4_d", q5: "ok" },
      interestVacancy: "trabajo",
    });
    expect(worst.total).toBeLessThan(25);
    expect(worst.indicators.filter((i) => i.tone === "caution").length).toBeGreaterThanOrEqual(3);
  });

  it("'No estoy seguro/a; primero preguntaría' recibe crédito parcial, no cero", () => {
    const unsure = scoreApplication({
      challenge: { q1: "q1_u", q2: "q2_u", q3: "q3_u", q4: "q4_u", q5: best.q5 },
      interestVacancy: interest,
    });
    const worst = scoreApplication({
      challenge: { q1: "q1_c", q2: "q2_a", q3: "q3_c", q4: "q4_d", q5: best.q5 },
      interestVacancy: interest,
    });
    expect(unsure.total).toBeGreaterThan(worst.total + 20);
    expect(unsure.total).toBeLessThan(100);
  });

  it("la respuesta abierta no depende de acentos, mayúsculas ni ortografía", () => {
    const formal = scoreApplication({ challenge: { ...best, q5: "Buenos días, bienvenido. ¿Qué uso le daría a la moto? Con gusto le oriento." }, interestVacancy: interest });
    const informal = scoreApplication({ challenge: { ...best, q5: "buenos dias bienvenido que uso le daria a la moto? con gusto le oriento" }, interestVacancy: interest });
    expect(informal.total).toBe(formal.total);
  });

  it("decir 'estoy empezando' en el interés no penaliza frente a quien ya conoce motos", () => {
    const beginner = scoreApplication({ challenge: best, interestVacancy: "Estoy empezando a conocer el producto pero me gusta aprender" });
    const expert = scoreApplication({ challenge: best, interestVacancy: "Conozco todas las marcas, cilindradas y fichas técnicas del mercado" });
    expect(beginner.total).toBe(expert.total);
  });
});
