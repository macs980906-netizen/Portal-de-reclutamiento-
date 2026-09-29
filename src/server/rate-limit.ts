import "server-only";
import { prisma } from "./db";
import { hmac } from "./crypto";
import { isSheetsMode } from "./env";

// Modo sheets (sin base de datos): límite en memoria por instancia. Es una defensa básica;
// el campo trampa y el tiempo mínimo de llenado siguen activos.
const memory = new Map<string, { count: number; start: number }>();

function memoryLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || now - b.start > windowSeconds * 1000) {
    memory.set(key, { count: 1, start: now });
    if (memory.size > 5000) memory.clear();
    return { allowed: true, remaining: limit - 1 };
  }
  b.count++;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count) };
}

/**
 * Límite de uso de ventana fija, persistido en BD (funciona con varias instancias).
 * Una sola sentencia atómica evita condiciones de carrera. La clave se guarda como
 * HMAC: nunca se almacena la IP ni el correo en claro.
 */
export async function rateLimit(scope: string, identifier: string, limit: number, windowSeconds: number) {
  const key = `${scope}:${hmac(identifier)}`;
  if (isSheetsMode()) return memoryLimit(key, limit, windowSeconds);
  const windowStart = new Date(Date.now() - windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < ${windowStart} THEN NOW() ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export async function resetRateLimit(scope: string, identifier: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key: `${scope}:${hmac(identifier)}` } });
}
