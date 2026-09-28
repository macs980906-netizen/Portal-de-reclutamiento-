import "server-only";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { env } from "./env";

/** HMAC con secreto del servidor: permite comparar teléfonos/correos/IP sin guardarlos en claro. */
export function hmac(value: string): string {
  return createHmac("sha256", env().HASH_SECRET).update(value).digest("hex");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// Sin caracteres ambiguos (0/O, 1/I/L) para que el código sea fácil de dictar.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Código de postulación aleatorio y no secuencial, p. ej. `RMX-7K4P-Q9TD` (~40 bits). */
export function applicationCode(): string {
  const chunk = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `RMX-${chunk()}-${chunk()}`;
}
