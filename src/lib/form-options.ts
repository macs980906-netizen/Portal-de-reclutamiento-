/** Opciones de las preguntas cerradas del formulario (compartidas cliente/servidor). */

export const COMMUTE_OPTIONS = [
  { id: "si", label: "Sí" },
  { id: "dudas", label: "Tengo dudas, me gustaría platicarlo" },
  { id: "no", label: "No por ahora" },
] as const;

export const INTERVIEW_AVAILABILITY_OPTIONS = [
  { id: "semana_manana", label: "Entre semana por la mañana" },
  { id: "semana_tarde", label: "Entre semana por la tarde" },
  { id: "sabado", label: "Sábado" },
  { id: "flexible", label: "Tengo horario flexible" },
] as const;

export const SCHEDULE_TALK_OPTIONS = [
  { id: "si", label: "Sí" },
  { id: "depende", label: "Depende del horario" },
  { id: "no", label: "No por ahora" },
] as const;

export const FOLLOWUP_OPTIONS = [
  { id: "empezando", label: "Estoy empezando / no tengo experiencia formal" },
  { id: "ocasional", label: "He dado seguimiento de vez en cuando (mensajes o llamadas)" },
  { id: "regular", label: "Doy seguimiento con regularidad (agenda, lista de clientes o CRM)" },
] as const;

export const YEARS_OPTIONS = [
  { id: "ninguna", label: "Sin experiencia formal" },
  { id: "menos_1", label: "Menos de 1 año" },
  { id: "1_3", label: "De 1 a 3 años" },
  { id: "mas_3", label: "Más de 3 años" },
  { id: "prefiero_no", label: "Prefiero no decir" },
] as const;

export const VEHICLE_EXPERIENCE_OPTIONS = [
  { id: "no", label: "No" },
  { id: "motos", label: "Sí, en motos" },
  { id: "autos", label: "Sí, en autos u otros vehículos" },
] as const;

export const INTEREST_TOPIC_OPTIONS = [
  { id: "ventas", label: "Las ventas" },
  { id: "atencion", label: "La atención a clientes" },
  { id: "motos", label: "Las motocicletas y la movilidad" },
  { id: "empezando", label: "Estoy empezando a conocer el producto" },
] as const;

type Opt = { readonly id: string; readonly label: string };

export function optionLabel(options: readonly Opt[], id: string | null | undefined): string {
  if (!id) return "—";
  return options.find((o) => o.id === id)?.label ?? id;
}

export function ids<T extends readonly Opt[]>(options: T): [T[number]["id"], ...T[number]["id"][]] {
  return options.map((o) => o.id) as [T[number]["id"], ...T[number]["id"][]];
}
