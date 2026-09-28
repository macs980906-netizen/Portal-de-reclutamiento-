import type { ChallengeAnswers } from "@/lib/challenge";

/**
 * Minimización antes de enviar respuestas a un proveedor externo: se quitan nombre y
 * apellido de la persona, correos, teléfonos, enlaces y usuarios de redes. Además se
 * neutralizan los signos `<` y `>` para que el texto no pueda cerrar las etiquetas que
 * delimitan los datos en el prompt.
 */
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function redactText(text: string, person: { firstName?: string; lastName?: string }): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[CORREO]")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[ENLACE]")
    .replace(/(?:\+?\d[\s().-]*){8,}\d/g, "[TELÉFONO]")
    .replace(/(^|\s)@[\w.]{3,}/g, "$1[USUARIO]")
    .replace(/</g, "‹")
    .replace(/>/g, "›");

  const names = [person.firstName, person.lastName]
    .flatMap((n) => (n ?? "").split(/\s+/))
    .map((n) => n.trim())
    .filter((n) => n.length >= 3);
  for (const name of names) {
    // Coincide con o sin acentos, sin distinguir mayúsculas, como palabra completa.
    const pattern = strip(name)
      .split("")
      .map((ch) => (/[a-z]/i.test(ch) ? `[${ch}${ch.toUpperCase()}\\u00C0-\\u024F]` : escapeRe(ch)))
      .join("");
    out = out.replace(new RegExp(`(?<![\\p{L}])${pattern}(?![\\p{L}])`, "gu"), (m) =>
      strip(m).toLowerCase() === strip(name).toLowerCase() ? "[NOMBRE]" : m,
    );
  }
  return out;
}

export function redactAnswers(answers: ChallengeAnswers, person: { firstName?: string; lastName?: string }): ChallengeAnswers {
  return Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, redactText(v, person)])) as ChallengeAnswers;
}
