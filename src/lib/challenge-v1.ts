/**
 * Desafío v1 (histórico, opción múltiple + respuesta abierta). Sólo se usa para mostrar
 * expedientes recibidos con esta versión. Las postulaciones nuevas usan `challenge.ts`.
 *
 * Su puntaje por reglas se retiró; los puntajes históricos quedan guardados en cada
 * expediente (`scoreBreakdown`, `scoringVersion`) y no se recalculan.
 */

export const UNSURE_OPTION_TEXT = "No estoy seguro/a; primero le preguntaría al cliente.";

export type ChoiceQuestion = {
  id: string;
  kind: "choice";
  title: string;
  prompt: string;
  options: { id: string; text: string }[];
};

export type OpenQuestion = {
  id: string;
  kind: "open";
  title: string;
  prompt: string;
  hint: string;
  minLength: number;
  maxLength: number;
};

export type ChallengeQuestion = ChoiceQuestion | OpenQuestion;

export const CHALLENGE_V1_VERSION = "desafio-2026-09-v1";

export const CHALLENGE_V1: readonly ChallengeQuestion[] = [
  {
    id: "q1",
    kind: "choice",
    title: "Descubrir la necesidad",
    prompt: "Un cliente te dice que busca una moto, pero aún no sabe cuál. ¿Qué harías primero?",
    options: [
      { id: "q1_a", text: "Le muestro la moto que más se vende en la agencia; casi siempre funciona." },
      {
        id: "q1_b",
        text: "Le pregunto para qué la va a usar, qué presupuesto tiene en mente, si ya ha manejado y qué es lo más importante para él o ella.",
      },
      { id: "q1_c", text: "Le enseño la promoción del mes para que la aproveche." },
      { id: "q1_d", text: "Le doy un catálogo para que lo revise con calma y me busque cuando decida." },
      { id: "q1_u", text: UNSURE_OPTION_TEXT },
    ],
  },
  {
    id: "q2",
    kind: "choice",
    title: "Recomendar sin inventar",
    prompt:
      "Te preguntan por una característica técnica que no conoces (por ejemplo, el rendimiento de gasolina de un modelo). ¿Qué respondes?",
    options: [
      { id: "q2_a", text: "Le doy un dato aproximado para no quedar mal." },
      { id: "q2_b", text: "Cambio el tema hacia otra característica que sí conozco." },
      {
        id: "q2_c",
        text: "Le digo que no tengo el dato exacto, lo confirmo en la ficha técnica o con un compañero y le respondo.",
      },
      { id: "q2_d", text: "Le sugiero que lo busque en internet." },
      { id: "q2_u", text: UNSURE_OPTION_TEXT },
    ],
  },
  {
    id: "q3",
    kind: "choice",
    title: "Objeción de precio",
    prompt: "El cliente te dice: “Está más cara de lo que pensaba”. ¿Cómo continúas?",
    options: [
      { id: "q3_a", text: "Le digo que seguro le consigo un descuento, aunque todavía no lo haya confirmado." },
      { id: "q3_b", text: "Le explico que es de muy buena calidad y que vale lo que cuesta." },
      { id: "q3_c", text: "Le insisto en que la promoción se acaba hoy para que decida rápido." },
      {
        id: "q3_d",
        text: "Le pregunto qué presupuesto tenía pensado y qué es lo más importante para él o ella, y le muestro opciones reales que se ajusten.",
      },
      { id: "q3_u", text: UNSURE_OPTION_TEXT },
    ],
  },
  {
    id: "q4",
    kind: "choice",
    title: "Seguimiento",
    prompt: "Después de recibir información, el cliente deja de responder tus mensajes. ¿Qué harías?",
    options: [
      { id: "q4_a", text: "Le escribo todos los días hasta que me conteste." },
      { id: "q4_b", text: "No le vuelvo a escribir; si le interesa, regresará." },
      {
        id: "q4_c",
        text: "Le mando un mensaje breve con algo útil (por ejemplo, lo que me pidió) y le pregunto si prefiere que lo contacte más adelante.",
      },
      { id: "q4_d", text: "Le digo que sólo queda una unidad para que responda, aunque no sea cierto." },
      { id: "q4_u", text: UNSURE_OPTION_TEXT },
    ],
  },
  {
    id: "q5",
    kind: "open",
    title: "Tu forma de iniciar",
    prompt:
      "En 2 a 4 frases, ¿cómo iniciarías la conversación con alguien que llega a la agencia y te dice: “Sólo estoy viendo”?",
    hint: "Escríbelo como lo dirías en persona. No hay un guion correcto ni se califica la ortografía.",
    minLength: 15,
    maxLength: 700,
  },
] as const;

export const CHOICE_QUESTIONS = CHALLENGE_V1.filter((q): q is ChoiceQuestion => q.kind === "choice");
export const OPEN_QUESTION = CHALLENGE_V1.find((q): q is OpenQuestion => q.kind === "open")!;

export type ChallengeAnswers = {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
};
