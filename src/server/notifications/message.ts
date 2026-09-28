/**
 * Contenido de las notificaciones al equipo. Deliberadamente mínimo: nunca incluye CV,
 * respuestas, teléfonos ni correos de candidatos. Los enlaces llevan al panel, que exige
 * inicio de sesión individual.
 */

export type NewApplicationPayload = { kind: "NEW_APPLICATION"; name: string; agency: string; link: string };
export type ShortlistPayload = {
  kind: "SHORTLIST";
  cycleName: string;
  recommended: number;
  tie: boolean;
  manualReview: number;
  link: string;
};
export type NotificationPayload = NewApplicationPayload | ShortlistPayload;

export function shortName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return `${firstName.trim()}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}

export function panelLink(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/$/, "")}${path}`;
}

export function newApplicationPayload(f: {
  applicationId: string;
  firstName: string;
  lastName: string;
  agency: string;
  appUrl: string;
}): NewApplicationPayload {
  return {
    kind: "NEW_APPLICATION",
    name: shortName(f.firstName, f.lastName),
    agency: f.agency,
    link: panelLink(f.appUrl, `/admin/postulaciones/${encodeURIComponent(f.applicationId)}`),
  };
}

export function shortlistPayload(f: {
  cycleId: string;
  cycleName: string;
  recommended: number;
  tie: boolean;
  manualReview: number;
  appUrl: string;
}): ShortlistPayload {
  return {
    kind: "SHORTLIST",
    cycleName: f.cycleName.slice(0, 80),
    recommended: f.recommended,
    tie: f.tie,
    manualReview: f.manualReview,
    link: panelLink(f.appUrl, `/admin/convocatorias/${encodeURIComponent(f.cycleId)}`),
  };
}

function profiles(n: number) {
  return n === 1 ? "1 perfil recomendado" : `${n} perfiles recomendados`;
}

/** Variables de plantilla (WhatsApp Cloud / Twilio), en orden {{1}}, {{2}}… */
export function templateParams(p: NotificationPayload): string[] {
  if (p.kind === "NEW_APPLICATION") return [p.name, p.agency, p.link];
  return [profiles(p.recommended), p.cycleName, p.link];
}

export function notificationText(p: NotificationPayload): string {
  if (p.kind === "NEW_APPLICATION") {
    return [
      "RiderMex · Nueva candidatura",
      `${p.name} · Agencia preferida: ${p.agency}`,
      "La evaluación orientativa se mostrará en el panel.",
      `Expediente (requiere iniciar sesión): ${p.link}`,
    ].join("\n");
  }
  const extra = [
    p.tie ? "Hay un empate en el último lugar: el equipo debe resolverlo." : "",
    p.manualReview ? `${p.manualReview} expediente(s) requieren revisión manual.` : "",
  ].filter(Boolean);
  return [
    p.recommended
      ? `Shortlist RiderMex lista: ${profiles(p.recommended)} para entrevista.`
      : "Shortlist RiderMex: ningún perfil alcanzó el umbral en esta convocatoria.",
    `Convocatoria: ${p.cycleName}.`,
    ...extra,
    `Revisa puntajes, evidencia y datos de contacto en el portal: ${p.link}`,
  ].join("\n");
}

export function notificationSubject(p: NotificationPayload): string {
  return p.kind === "NEW_APPLICATION" ? "RiderMex · Nueva candidatura" : `RiderMex · Shortlist lista: ${p.cycleName}`;
}

export type Recipient = { label: string; phone: string; masked: string };
export type EmailRecipient = { label: string; email: string; masked: string };

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

/** Formato de NOTIFY_EMAIL_RECIPIENTS: `Nombre|correo@dominio,Otra persona|correo2@dominio` */
export function parseEmailRecipients(raw: string): EmailRecipient[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, emailRaw] = entry.includes("|") ? entry.split("|", 2) : ["Equipo", entry];
      const email = (emailRaw ?? "").trim().toLowerCase();
      return { label: (label ?? "Equipo").trim().slice(0, 40) || "Equipo", email, masked: maskEmail(email) };
    })
    .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email));
}

export function maskPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : "••••";
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return user && domain ? `${user.charAt(0)}•••@${domain}` : "•••";
}
