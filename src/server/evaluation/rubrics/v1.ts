import type { Rubric } from "../types";

/**
 * Rúbrica v1 del Desafío de ventas RiderMex (preguntas `desafio-2026-10-v2`).
 *
 * Herramienta de priorización basada en una rúbrica de trabajo: no es un instrumento
 * validado científicamente ni identifica "a los mejores vendedores". La decisión de
 * contactar, entrevistar o contratar es siempre del equipo.
 *
 * NO editar una vez usada en una convocatoria: crear `v2.ts` y registrarla. Cada
 * evaluación guarda la versión y los pesos con los que se calculó.
 */
export const RUBRIC_V1: Rubric = {
  version: "rubrica-2026-10-v1",
  questionSetVersion: "desafio-2026-10-v2",
  scale: {
    0: "No hay respuesta evaluable o la respuesta contradice de forma clara la conducta requerida.",
    1: "Muestra poco desarrollo; no propone una acción útil o depende de presión, engaño o invención.",
    2: "Respuesta razonable pero incompleta; identifica parte del problema y propone una acción básica.",
    3: "Respuesta sólida y aplicable; muestra buen criterio y una acción concreta.",
    4: "Respuesta especialmente sólida; muestra criterio, empatía, iniciativa y un seguimiento claro sin perder honestidad ni respeto.",
  },
  dimensions: [
    {
      id: "discovery",
      label: "Descubrimiento de necesidades",
      weight: 20,
      sources: ["q1", "q5"],
      lookFor:
        "Explora el uso previsto, presupuesto, prioridades, experiencia manejando o necesidades del cliente ANTES de recomendar un modelo. Hace preguntas abiertas y escucha.",
      redFlags: "Recomienda un modelo o promoción sin preguntar nada; asume lo que el cliente necesita.",
    },
    {
      id: "objections",
      label: "Manejo de objeciones y resolución",
      weight: 20,
      sources: ["q3"],
      lookFor:
        "Ante la objeción de precio pregunta qué presupuesto tenía en mente, entiende prioridades y explica opciones reales (otros modelos, formas de pago existentes) sin presionar.",
      redFlags:
        "Presiona o apura la decisión, oculta condiciones, promete descuentos o pagos no confirmados, o abandona la conversación.",
    },
    {
      id: "communication",
      label: "Comunicación y orientación al cliente",
      weight: 15,
      sources: ["q5", "q1", "q4"],
      lookFor:
        "Abre la conversación con cordialidad, sin acorralar al cliente; ofrece ayuda de forma clara y deja espacio para que la persona decida.",
      redFlags:
        "Insistencia, tono que presiona o incomoda, o un mensaje tan confuso que no se entiende la intención. (No califiques ortografía, acentos, puntuación ni formalidad.)",
    },
    {
      id: "honesty",
      label: "Honestidad, criterio y aprendizaje del producto",
      weight: 15,
      sources: ["q2", "q3"],
      lookFor:
        "Reconoce cuando no sabe un dato, evita inventarlo, lo consulta en una fuente confiable (ficha, compañero, gerente) y retoma el contacto con la información correcta.",
      redFlags:
        "Inventa o aproxima datos para no quedar mal, promete cosas no confirmadas, o deja al cliente sin respuesta. No saber el dato de memoria NO resta puntos.",
    },
    {
      id: "followup",
      label: "Seguimiento e iniciativa comercial",
      weight: 15,
      sources: ["q4"],
      lookFor:
        "Seguimiento oportuno, útil y personalizado (aporta algo de valor, pregunta si prefiere retomarlo después) y respetuoso del tiempo y la decisión del cliente.",
      redFlags: "Insistencia agresiva, mensajes engañosos (falsa urgencia, falsa escasez) o ningún seguimiento.",
    },
    {
      id: "evidence",
      label: "Calidad de la evidencia conductual aportada",
      weight: 15,
      sources: ["q6"],
      lookFor:
        "Describe una situación concreta (formal o informal, de cualquier ámbito) con lo que hizo personalmente y el resultado. Si no tiene ejemplo, un plan hipotético concreto y razonable también cuenta.",
      redFlags:
        "Respuesta genérica sin acciones propias ni resultado. No tener empleo previo como vendedor NO resta puntos.",
    },
  ],
  eligibility: {
    version: "elegibilidad-2026-10-v1",
    minWordsPerAnswer: 3,
    description:
      "Postulación enviada completa, aviso de privacidad aceptado y las 6 respuestas del desafío contestadas (al menos 3 palabras cada una). No se usan experiencia en motos, CV, zona ni puntaje como criterio de elegibilidad.",
  },
};
