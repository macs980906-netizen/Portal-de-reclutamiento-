import { describe, expect, it } from "vitest";
import { computeShortlist, type Candidate } from "@/server/evaluation/shortlist";

const c = (code: string, total: number | null, extra: Partial<Candidate> = {}): Candidate => ({
  applicationId: `id-${code}`,
  code,
  eligible: true,
  ineligibleReasons: [],
  evalStatus: total === null ? "PENDING" : "COMPLETED",
  total,
  ...extra,
});

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe("shortlist", () => {
  it("recomienda como máximo 5 perfiles que alcanzan el umbral", () => {
    const r = computeShortlist([c("A", 95), c("B", 90), c("C", 88), c("D", 85), c("E", 80), c("F", 76), c("G", 60)], 5, 70);
    expect(r.recommended.map((x) => x.code)).toEqual(["A", "B", "C", "D", "E"]);
    expect(r.tie).toBeNull();
    expect(r.belowThresholdCount).toBe(1);
  });

  it("si sólo 3 alcanzan el umbral, recomienda 3 y no rellena", () => {
    const r = computeShortlist([c("A", 90), c("B", 75), c("C", 70), c("D", 69.9), c("E", 40)], 5, 70);
    expect(r.recommended.map((x) => x.code)).toEqual(["A", "B", "C"]);
  });

  it("empate en el quinto lugar: incluye a todas las empatadas y lo señala", () => {
    const r = computeShortlist([c("A", 95), c("B", 90), c("C", 88), c("D", 85), c("E", 80), c("F", 80), c("G", 80), c("H", 75)], 5, 70);
    expect(r.recommended.map((x) => x.code).sort()).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(r.tie).toEqual({ total: 80, applicationIds: ["id-E", "id-F", "id-G"], openSlots: 1 });
    expect(r.recommended.filter((x) => x.total === 80).every((x) => x.rank === 5)).toBe(true);
  });

  it("un empate que cabe exactamente no se marca como empate por resolver", () => {
    const r = computeShortlist([c("A", 95), c("B", 90), c("C", 88), c("D", 80), c("E", 80)], 5, 70);
    expect(r.recommended).toHaveLength(5);
    expect(r.tie).toBeNull();
  });

  it("las evaluaciones pendientes o fallidas bloquean y nunca cuentan como cero", () => {
    const r = computeShortlist([c("A", 95), c("B", null), c("C", null, { evalStatus: "FAILED" }), c("D", null, { evalStatus: "MISSING" })], 5, 70);
    expect(r.blocked.map((b) => b.code)).toEqual(["B", "C", "D"]);
    expect(r.ranked.map((x) => x.code)).toEqual(["A"]);
  });

  it("las de revisión manual se separan del ranking, sin excluirse en silencio", () => {
    const r = computeShortlist([c("A", 95), c("B", null, { evalStatus: "NEEDS_REVIEW", reviewReasons: ["confianza baja"] })], 5, 70);
    expect(r.manualReview).toEqual([{ applicationId: "id-B", code: "B", reasons: ["confianza baja"] }]);
    expect(r.blocked).toEqual([]);
  });

  it("las no elegibles se listan con su motivo", () => {
    const r = computeShortlist([c("A", 95, { eligible: false, ineligibleReasons: ["Respuestas sin contestar: Q6"] })], 5, 70);
    expect(r.ineligible[0]!.reasons).toEqual(["Respuestas sin contestar: Q6"]);
    expect(r.recommended).toEqual([]);
  });

  it("el orden de envío no altera el resultado (50 candidaturas, varias permutaciones)", () => {
    const base = Array.from({ length: 50 }, (_, i) => c(`K${String(i).padStart(2, "0")}`, [60, 65, 70, 72.5, 75, 80, 85, 90][i % 8]!));
    const reference = computeShortlist(base, 5, 70);
    for (const seed of [1, 7, 42, 2026]) {
      expect(computeShortlist(shuffle(base, seed), 5, 70)).toEqual(reference);
    }
  });

  it("el tamaño de la shortlist se configura por convocatoria", () => {
    const list = [c("A", 95), c("B", 90), c("C", 88), c("D", 85)];
    expect(computeShortlist(list, 2, 70).recommended.map((x) => x.code)).toEqual(["A", "B"]);
    expect(computeShortlist(list, 10, 70).recommended).toHaveLength(4);
  });
});
