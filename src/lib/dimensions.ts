/** Dimensiones del puntaje orientativo (etiquetas visibles para el equipo). */
export const DIMENSIONS = [
  { id: "discovery", label: "Venta consultiva y descubrimiento" },
  { id: "honesty", label: "Manejo de objeciones y honestidad" },
  { id: "empathy", label: "Escucha, empatía y orientación al cliente" },
  { id: "followup", label: "Seguimiento y criterio comercial" },
  { id: "communication", label: "Comunicación clara (respuesta abierta)" },
  { id: "learning", label: "Aprendizaje e interés en el producto" },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

export function dimensionLabel(id: string): string {
  return DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

export const SCORE_DISCLAIMER =
  "Este puntaje orienta la revisión; no es una decisión automática de contratación.";
