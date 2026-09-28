import type { ChallengeQuestion } from "@/lib/challenge";

export type QuestionId = ChallengeQuestion["id"];

export type RubricDimension = {
  id: string;
  label: string;
  /** Puntos máximos de la dimensión en el total de 100. */
  weight: number;
  /** Preguntas donde se busca evidencia (la primera es la principal). */
  sources: QuestionId[];
  /** Qué conducta se busca (se muestra al equipo y va en el prompt). */
  lookFor: string;
  /** Qué resta puntos en esta dimensión. */
  redFlags: string;
};

export type Rubric = {
  version: string;
  questionSetVersion: string;
  /** Anclas comunes de la escala 0–4. */
  scale: Record<0 | 1 | 2 | 3 | 4, string>;
  dimensions: RubricDimension[];
  eligibility: {
    version: string;
    /** Mínimo de palabras por respuesta para considerarla contestada. */
    minWordsPerAnswer: number;
    description: string;
  };
};

export type Confidence = "Bajo" | "Medio" | "Alto";

/** Resultado por dimensión tal como se guarda (validado). */
export type DimensionResult = {
  id: string;
  score: number; // 0–4
  evidence: string;
  rationale: string;
  confidence: Confidence;
  needs_human_review: boolean;
  review_reason: string;
};
