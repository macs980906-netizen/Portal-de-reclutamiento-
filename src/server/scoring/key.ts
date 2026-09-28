import "server-only";
import type { DimensionId } from "@/lib/dimensions";

/**
 * CLAVE DE RESPUESTAS Y PESOS — sólo servidor. Nunca importar desde componentes cliente.
 *
 * Cómo leerla (rúbrica para el equipo):
 * - Cada opción aporta puntos "crudos" a una o más dimensiones.
 * - `WEIGHTS` define el máximo de cada dimensión en el puntaje final (total 100).
 *   Puntaje de la dimensión = (crudo / máximo crudo posible) × peso.
 * - `indicator` es el texto explicable que ve el equipo en el expediente.
 * - La opción "No estoy seguro/a; primero preguntaría" recibe crédito parcial:
 *   preguntar antes de actuar es una conducta razonable.
 *
 * Si cambias puntos o pesos, incrementa `SCORING_VERSION`: cada expediente guarda la
 * versión con la que se calculó.
 */
export const SCORING_VERSION = "2026-09-v1";

export const WEIGHTS: Record<DimensionId, number> = {
  discovery: 25,
  honesty: 20,
  empathy: 20,
  followup: 15,
  communication: 10,
  learning: 10,
};

export type Tone = "positive" | "neutral" | "caution";

export type OptionRule = {
  points: Partial<Record<DimensionId, number>>;
  indicator: string;
  tone: Tone;
};

export const CHOICE_KEY: Record<string, Record<string, OptionRule>> = {
  q1: {
    q1_a: { points: { discovery: 5, empathy: 1 }, indicator: "Recomienda antes de conocer la necesidad del cliente.", tone: "neutral" },
    q1_b: { points: { discovery: 20, empathy: 5 }, indicator: "Explora uso, presupuesto, experiencia y prioridades antes de recomendar.", tone: "positive" },
    q1_c: { points: { discovery: 3, empathy: 1 }, indicator: "Lleva la conversación a una promoción sin contexto.", tone: "caution" },
    q1_d: { points: { discovery: 4, empathy: 2 }, indicator: "Deja la decisión al cliente sin acompañarlo.", tone: "neutral" },
    q1_u: { points: { discovery: 14, empathy: 4 }, indicator: "Reconoce que primero hay que preguntar al cliente.", tone: "positive" },
  },
  q2: {
    q2_a: { points: { honesty: 0, learning: 0 }, indicator: "Daría un dato aproximado sin confirmarlo (riesgo de inventar información).", tone: "caution" },
    q2_b: { points: { honesty: 3, learning: 1 }, indicator: "Evita la pregunta cambiando de tema.", tone: "neutral" },
    q2_c: { points: { honesty: 10, learning: 5 }, indicator: "Recomienda confirmar el dato antes de responder y dar seguimiento.", tone: "positive" },
    q2_d: { points: { honesty: 3, learning: 0 }, indicator: "Traslada la búsqueda del dato al cliente.", tone: "neutral" },
    q2_u: { points: { honesty: 7, learning: 3 }, indicator: "Prefiere aclarar antes de responder.", tone: "positive" },
  },
  q3: {
    q3_a: { points: { honesty: 0, empathy: 1 }, indicator: "Promete un descuento no verificado.", tone: "caution" },
    q3_b: { points: { honesty: 5, empathy: 2 }, indicator: "Defiende el valor, pero sin explorar el presupuesto.", tone: "neutral" },
    q3_c: { points: { honesty: 1, empathy: 0 }, indicator: "Usa presión de tiempo para cerrar.", tone: "caution" },
    q3_d: { points: { honesty: 10, empathy: 5 }, indicator: "Explora presupuesto y prioridades y ofrece opciones reales.", tone: "positive" },
    q3_u: { points: { honesty: 6, empathy: 3 }, indicator: "Prefiere preguntar antes de proponer.", tone: "neutral" },
  },
  q4: {
    q4_a: { points: { followup: 2, empathy: 0 }, indicator: "Seguimiento insistente (diario, sin permiso).", tone: "caution" },
    q4_b: { points: { followup: 3, empathy: 2 }, indicator: "No da seguimiento.", tone: "neutral" },
    q4_c: { points: { followup: 15, empathy: 5 }, indicator: "Seguimiento respetuoso, útil y con permiso para retomar.", tone: "positive" },
    q4_d: { points: { followup: 0, empathy: 0 }, indicator: "Usaría un mensaje engañoso para obtener respuesta.", tone: "caution" },
    q4_u: { points: { followup: 8, empathy: 3 }, indicator: "Preguntaría al cliente cómo prefiere seguir.", tone: "neutral" },
  },
};

/**
 * Reglas de la respuesta abierta (q5). Son deliberadamente sencillas y visibles:
 * NO califican ortografía, vocabulario ni sofisticación. Sólo detectan señales
 * generales y siempre deben leerse junto con la respuesta original.
 */
export const OPEN_RULES = {
  /** Invita a la persona a contar qué busca (hace al menos una pregunta). */
  asksQuestion: { dimension: "discovery" as const, points: 5 },
  /** Recibe de forma cordial o sin presión. */
  welcoming: {
    dimension: "empathy" as const,
    points: 5,
    fallbackIfQuestion: 3,
    keywords: [
      "hola", "buen dia", "buenos dias", "buenas", "bienvenid", "adelante", "con gusto", "tranquil",
      "sin compromiso", "sin presion", "a tus ordenes", "a sus ordenes", "cuando gustes", "con calma",
      "aqui estoy", "aqui ando", "que gusto", "mucho gusto", "estoy para", "estamos para", "gracias por",
    ],
  },
  /** Extensión razonable: permite entender la idea (no premia textos largos). */
  length: { dimension: "communication" as const, full: 6, partial: 3, minWords: 8, partialMinWords: 3, maxWords: 140 },
  /** Ofrece orientación o ayuda concreta. */
  offersHelp: {
    dimension: "communication" as const,
    points: 4,
    keywords: [
      "ayud", "orient", "mostrar", "muestro", "ensen", "duda", "platic", "conoc", "recorr",
      "explic", "cualquier cosa", "lo que necesites", "lo que necesite", "informacion", "asesor",
    ],
  },
};

/** Paso D: interés expresado con sus propias palabras (incluye "estoy empezando"). */
export const LEARNING_RULES = {
  dimension: "learning" as const,
  full: 5,
  partial: 3,
  minWords: 5,
};
