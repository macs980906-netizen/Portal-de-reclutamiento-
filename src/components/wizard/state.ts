import type { ApplicationInput } from "@/lib/validation";

/** Estado del formulario tal como lo edita la persona (cadenas vacías = sin responder). */
export type FormState = {
  contact: { firstName: string; lastName: string; phone: string; email: string };
  preferences: {
    anyAgency: boolean;
    agencyFirst: string;
    agencySecond: string;
    generalArea: string;
    canCommute: string;
    interviewAvailability: string[];
    scheduleTalk: string;
    scheduleAcknowledged: boolean;
  };
  experience: {
    productsSold: string;
    followupExperience: string;
    followupDetail: string;
    yearsExperience: string;
    vehicleSalesExperience: string;
  };
  interest: { interestVacancy: string; interestTopics: string[]; interestDetail: string };
  challenge: { q1: string; q2: string; q3: string; q4: string; q5: string; q6: string };
  consent: { privacyAccepted: boolean; futureVacancies: boolean };
};

export const EMPTY_STATE: FormState = {
  contact: { firstName: "", lastName: "", phone: "", email: "" },
  preferences: {
    anyAgency: false,
    agencyFirst: "",
    agencySecond: "",
    generalArea: "",
    canCommute: "",
    interviewAvailability: [],
    scheduleTalk: "",
    scheduleAcknowledged: false,
  },
  experience: {
    productsSold: "",
    followupExperience: "",
    followupDetail: "",
    yearsExperience: "",
    vehicleSalesExperience: "",
  },
  interest: { interestVacancy: "", interestTopics: [], interestDetail: "" },
  challenge: { q1: "", q2: "", q3: "", q4: "", q5: "", q6: "" },
  consent: { privacyAccepted: false, futureVacancies: false },
};

export type Section = keyof FormState;

export type StepId =
  | "intro"
  | "contact"
  | "preferences"
  | "experience"
  | "interest"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "q6"
  | "review";

export const STEPS: StepId[] = ["intro", "contact", "preferences", "experience", "interest", "q1", "q2", "q3", "q4", "q5", "q6", "review"];

/** Grupos visibles en la barra de progreso. */
export const PROGRESS_GROUPS: { label: string; steps: StepId[] }[] = [
  { label: "Contacto", steps: ["contact"] },
  { label: "Preferencias", steps: ["preferences"] },
  { label: "Experiencia", steps: ["experience"] },
  { label: "Interés", steps: ["interest"] },
  { label: "Desafío", steps: ["q1", "q2", "q3", "q4", "q5", "q6"] },
  { label: "Envío", steps: ["review"] },
];

/** Paso del formulario donde vive un campo (para llevar a la persona al error). */
export function stepForErrorPath(path: string): StepId {
  const [section, field] = path.split(".");
  if (section === "challenge" && field && /^q[1-6]$/.test(field)) return field as StepId;
  if (section === "contact" || section === "preferences" || section === "experience" || section === "interest") return section;
  return "review";
}

const blank = (v: string) => (v.trim() === "" ? undefined : v);

/** Convierte el estado editable en la entrada del esquema (cadenas vacías → sin valor). */
export function toPayloadSection<S extends Section>(state: FormState, section: S): ApplicationInput[S] {
  const s = state[section] as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = typeof v === "string" ? blank(v) : v;
  }
  if (section === "preferences") {
    if (out.scheduleAcknowledged === false) delete out.scheduleAcknowledged;
  }
  return out as ApplicationInput[S];
}

// v2: desafío de 6 respuestas abiertas (no se reutilizan borradores del desafío anterior).
export const STORAGE_KEY = "rmx-postulacion-v2";

export type Persisted = {
  state: FormState;
  step: StepId;
  startedAt: number;
  submissionKey: string;
  funnelCounted?: boolean;
};

/**
 * Guardado temporal en sessionStorage: permanece sólo en esta pestaña del dispositivo y
 * se borra al cerrar la pestaña o al enviar. El CV no se guarda.
 */
export function loadPersisted(): Persisted | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!p?.state || !STEPS.includes(p.step)) return null;
    return {
      ...p,
      state: {
        contact: { ...EMPTY_STATE.contact, ...p.state.contact },
        preferences: { ...EMPTY_STATE.preferences, ...p.state.preferences },
        experience: { ...EMPTY_STATE.experience, ...p.state.experience },
        interest: { ...EMPTY_STATE.interest, ...p.state.interest },
        challenge: { ...EMPTY_STATE.challenge, ...p.state.challenge },
        consent: { ...EMPTY_STATE.consent, ...p.state.consent },
      },
    };
  } catch {
    return null;
  }
}

export function savePersisted(p: Persisted) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: el formulario sigue funcionando, sólo sin guardado temporal */
  }
}

export function clearPersisted() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
