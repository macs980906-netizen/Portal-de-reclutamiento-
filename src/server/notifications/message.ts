/**
 * Contenido de la notificación al equipo. Deliberadamente mínimo: NO incluye CV,
 * respuestas, teléfono ni correo de la persona candidata. El enlace lleva al panel,
 * que exige autenticación.
 */
export type NotificationFacts = {
  applicationId: string;
  firstName: string;
  lastName: string;
  agency: string;
  score: number;
  appUrl: string;
};

export function notificationParams(f: NotificationFacts) {
  const initial = f.lastName.trim().charAt(0);
  return {
    name: `${f.firstName.trim()}${initial ? ` ${initial.toUpperCase()}.` : ""}`,
    agency: f.agency,
    score: `${Math.round(f.score)}/100`,
    link: `${f.appUrl.replace(/\/$/, "")}/admin/postulaciones/${encodeURIComponent(f.applicationId)}`,
  };
}

export function notificationText(f: NotificationFacts): string {
  const p = notificationParams(f);
  return [
    "RiderMex · Nueva candidatura",
    `${p.name} · Agencia preferida: ${p.agency}`,
    `Puntaje orientativo: ${p.score} (requiere revisión humana)`,
    `Expediente (requiere iniciar sesión): ${p.link}`,
  ].join("\n");
}

export type Recipient = { label: string; phone: string; masked: string };

/**
 * Formato de NOTIFY_WHATSAPP_RECIPIENTS: `Nombre|+5215512345678,Otra persona|+52...`
 * Los números viven sólo en variables de entorno, nunca en el repositorio.
 */
export function parseRecipients(raw: string): Recipient[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, phoneRaw] = entry.includes("|") ? entry.split("|", 2) : ["Equipo", entry];
      const digits = (phoneRaw ?? "").replace(/[^\d]/g, "");
      return { label: (label ?? "Equipo").trim().slice(0, 40) || "Equipo", phone: digits ? `+${digits}` : "", masked: maskPhone(digits) };
    })
    .filter((r) => /^\+\d{10,15}$/.test(r.phone));
}

export function maskPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : "••••";
}
