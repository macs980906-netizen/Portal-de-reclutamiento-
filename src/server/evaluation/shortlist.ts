/**
 * Cálculo de la shortlist (función pura y determinista).
 *
 * Reglas:
 * 1. Sólo candidaturas completas y elegibles (requisitos mínimos transparentes).
 * 2. Evaluaciones pendientes, en proceso o fallidas BLOQUEAN el cierre (nunca cuentan como 0).
 * 3. Las que requieren revisión manual se separan y se muestran aparte (no se excluyen en silencio).
 * 4. Se ordena por puntaje final; se recomiendan hasta `targetCount` que alcancen el umbral.
 * 5. Nunca se rellenan lugares con perfiles bajo el umbral.
 * 6. Empate en el último lugar: se incluyen todas las personas empatadas y se marca el empate
 *    para que el equipo lo resuelva. No se desempata por orden de llegada, nombre ni otro dato.
 *    (El orden visual dentro de un empate usa el código aleatorio RMX-…, sin significado.)
 */

export type CandidateEvalStatus = "PENDING" | "RUNNING" | "COMPLETED" | "NEEDS_REVIEW" | "FAILED" | "MISSING";

export type Candidate = {
  applicationId: string;
  code: string;
  eligible: boolean;
  ineligibleReasons: string[];
  evalStatus: CandidateEvalStatus;
  total: number | null;
  reviewReasons?: string[];
};

export type RankedEntry = { applicationId: string; code: string; total: number; rank: number };

export type ShortlistComputation = {
  threshold: number;
  targetCount: number;
  blocked: { applicationId: string; code: string; status: CandidateEvalStatus }[];
  manualReview: { applicationId: string; code: string; reasons: string[] }[];
  ineligible: { applicationId: string; code: string; reasons: string[] }[];
  ranked: RankedEntry[];
  recommended: RankedEntry[];
  tie: null | { total: number; applicationIds: string[]; openSlots: number };
  belowThresholdCount: number;
};

const key = (n: number) => Math.round(n * 10);

export function computeShortlist(candidates: Candidate[], targetCount: number, threshold: number): ShortlistComputation {
  const blocked: ShortlistComputation["blocked"] = [];
  const manualReview: ShortlistComputation["manualReview"] = [];
  const ineligible: ShortlistComputation["ineligible"] = [];
  const scored: { applicationId: string; code: string; total: number }[] = [];

  for (const c of candidates) {
    if (!c.eligible) {
      ineligible.push({ applicationId: c.applicationId, code: c.code, reasons: c.ineligibleReasons });
      continue;
    }
    if (c.evalStatus === "NEEDS_REVIEW") {
      manualReview.push({ applicationId: c.applicationId, code: c.code, reasons: c.reviewReasons ?? [] });
      continue;
    }
    if (c.evalStatus !== "COMPLETED" || c.total === null) {
      blocked.push({ applicationId: c.applicationId, code: c.code, status: c.evalStatus });
      continue;
    }
    scored.push({ applicationId: c.applicationId, code: c.code, total: c.total });
  }

  scored.sort((a, b) => key(b.total) - key(a.total) || a.code.localeCompare(b.code));
  const ranked: RankedEntry[] = scored.map((s) => ({
    ...s,
    rank: 1 + scored.filter((o) => key(o.total) > key(s.total)).length,
  }));

  const above = ranked.filter((r) => key(r.total) >= key(threshold));
  let recommended = above;
  let tie: ShortlistComputation["tie"] = null;
  if (targetCount <= 0) {
    recommended = [];
  } else if (above.length > targetCount) {
    const cutoff = key(above[targetCount - 1]!.total);
    const clear = above.filter((r) => key(r.total) > cutoff);
    const tied = above.filter((r) => key(r.total) === cutoff);
    recommended = [...clear, ...tied];
    if (clear.length + tied.length > targetCount) {
      tie = { total: cutoff / 10, applicationIds: tied.map((t) => t.applicationId), openSlots: targetCount - clear.length };
    }
  }

  const sortById = <T extends { code: string }>(xs: T[]) => [...xs].sort((a, b) => a.code.localeCompare(b.code));
  return {
    threshold,
    targetCount,
    blocked: sortById(blocked),
    manualReview: sortById(manualReview),
    ineligible: sortById(ineligible),
    ranked,
    recommended,
    tie,
    belowThresholdCount: ranked.length - above.length,
  };
}
