/**
 * Verificación de lanzamiento. Se ejecuta antes de `next build`.
 * Con APP_ENV=production falla si hay pendientes obligatorios (aviso legal, retención,
 * sucursales, HTTPS, secretos, almacenamiento). En otros entornos sólo advierte.
 */
import { getLaunchItems } from "../src/config/launch";

const items = getLaunchItems();
const blockers = items.filter((i) => i.level === "blocker");
const env = process.env.APP_ENV ?? "development";

if (items.length) {
  console.log(`\nPendientes antes de producción (APP_ENV=${env}):`);
  for (const i of items) console.log(`  [${i.level === "blocker" ? "BLOQUEA" : "pendiente"}] ${i.title} — ${i.detail}`);
  console.log("");
}

if (env === "production" && blockers.length) {
  console.error(`✖ Build de producción bloqueado: ${blockers.length} pendiente(s) obligatorio(s).`);
  process.exit(1);
}
console.log(items.length ? "⚠ Continúa el build (entorno no productivo)." : "✔ Sin pendientes de lanzamiento.");
