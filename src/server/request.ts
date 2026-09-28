import "server-only";
import { env } from "./env";

/** IP del cliente. Sólo confía en cabeceras de proxy si TRUST_PROXY_HEADERS=true. */
export function clientIp(headers: Headers): string {
  if (env().TRUST_PROXY_HEADERS === "true") {
    const fwd = headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unknown";
}

/**
 * Protección CSRF para endpoints JSON/multipart: exige que Origin (o Referer) coincida
 * con el host de la petición o con APP_URL.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin") ?? headers.get("referer");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) allowed.add(host);
  try {
    allowed.add(new URL(env().APP_URL).host);
  } catch {
    /* APP_URL validado en env() */
  }
  return allowed.has(originHost);
}
