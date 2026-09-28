/**
 * "Desafío de ventas RiderMex" v2 — contenido PÚBLICO (se envía al navegador).
 *
 * Seis situaciones de trabajo con respuesta abierta. No es una prueba psicológica ni
 * mide científicamente la capacidad de ventas: es un ejercicio práctico que ayuda al
 * equipo a priorizar la revisión. La rúbrica, los pesos y el prompt de evaluación viven
 * sólo en el servidor (`src/server/evaluation/rubrics/`).
 *
 * Para cambiar preguntas: crear una versión nueva (no editar ésta), porque cada
 * postulación guarda la versión que contestó.
 */

export const QUESTION_SET_VERSION = "desafio-2026-10-v2";

export type ChallengeQuestion = {
  id: "q1" | "q2" | "q3" | "q4" | "q5" | "q6";
  title: string;
  prompt: string;
  hint: string;
  minLength: number;
  maxLength: number;
};

export const CHALLENGE: readonly ChallengeQuestion[] = [
  {
    id: "q1",
    title: "Descubrir la necesidad",
    prompt:
      "Una persona entra a la agencia y dice que quiere una moto, pero no sabe cuál elegir. ¿Qué le preguntarías antes de recomendarle una?",
    hint: "Escribe las preguntas que le harías, como se las dirías en persona.",
    minLength: 15,
    maxLength: 800,
  },
  {
    id: "q2",
    title: "Cuando no sabes un dato",
    prompt:
      "El cliente te pregunta algo específico sobre una moto y no estás seguro de la respuesta. ¿Qué le dirías y qué harías después?",
    hint: "No necesitas saber de mecánica: nos interesa qué harías tú en ese momento.",
    minLength: 15,
    maxLength: 800,
  },
  {
    id: "q3",
    title: "Objeción de presupuesto",
    prompt:
      "El cliente comenta: “Me gusta, pero se me hace más cara de lo que pensaba”. ¿Cómo continuarías la conversación?",
    hint: "Cuéntanos qué le dirías o preguntarías.",
    minLength: 15,
    maxLength: 800,
  },
  {
    id: "q4",
    title: "Seguimiento",
    prompt:
      "Le compartiste información a una persona interesada y no responde. ¿Qué harías? Si quieres, escribe un ejemplo breve de mensaje.",
    hint: "Puedes describir lo que harías o escribir el mensaje tal cual lo enviarías.",
    minLength: 15,
    maxLength: 800,
  },
  {
    id: "q5",
    title: "Iniciar la conversación",
    prompt:
      "Una persona llega y dice: “Sólo estoy viendo”. Escribe lo que le responderías para iniciar una conversación sin presionarla.",
    hint: "Escríbelo como lo dirías. No calificamos ortografía, acentos ni estilo formal.",
    minLength: 10,
    maxLength: 600,
  },
  {
    id: "q6",
    title: "Tu experiencia ayudando a decidir",
    prompt:
      "Cuéntanos brevemente una ocasión en que convenciste, ayudaste o acompañaste a alguien para que tomara una decisión. Puede ser en el trabajo, un negocio propio, un proyecto o una situación cotidiana. ¿Qué hiciste tú y qué pasó?",
    hint: "Vale cualquier experiencia, formal o informal. Si no tienes un ejemplo, cuéntanos cómo lo resolverías en una situación imaginaria.",
    minLength: 20,
    maxLength: 1200,
  },
] as const;

export const QUESTION_IDS = CHALLENGE.map((q) => q.id);

export type ChallengeAnswers = Record<ChallengeQuestion["id"], string>;
