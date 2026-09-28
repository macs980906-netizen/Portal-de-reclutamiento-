/** Estados del proceso. Editables: agregar/renombrar aquí (el valor `id` se guarda en BD). */
export const STATUSES = [
  { id: "NUEVO", label: "Nuevo", tone: "info" },
  { id: "EN_REVISION", label: "En revisión", tone: "neutral" },
  { id: "REVISION_MANUAL", label: "Revisar manualmente", tone: "neutral" },
  { id: "INVITAR_ENTREVISTA", label: "Invitar a entrevista", tone: "accent" },
  { id: "CONTACTAR", label: "Contactar", tone: "accent" },
  { id: "ENTREVISTA_AGENDADA", label: "Entrevista agendada", tone: "accent" },
  { id: "EN_PROCESO", label: "En proceso", tone: "neutral" },
  { id: "NO_SELECCIONADA", label: "No continúa en esta ronda", tone: "muted" },
  { id: "NO_CONTINUA", label: "No continúa", tone: "muted" },
  { id: "CONTRATADO", label: "Contratado", tone: "success" },
] as const;

export type StatusId = (typeof STATUSES)[number]["id"];
export const STATUS_IDS = STATUSES.map((s) => s.id) as [StatusId, ...StatusId[]];
export const DEFAULT_STATUS: StatusId = "NUEVO";

export function statusLabel(id: string): string {
  return STATUSES.find((s) => s.id === id)?.label ?? id;
}

export const PRIORITIES = [
  { value: 1, label: "Alta" },
  { value: 0, label: "Normal" },
  { value: -1, label: "Baja" },
] as const;
