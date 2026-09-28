/**
 * Se ejecuta al arrancar el servidor. En producción impide iniciar si faltan datos
 * legales u operativos obligatorios (misma lista que `npm run check:launch`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getLaunchItems } = await import("./config/launch");
  const items = getLaunchItems();
  const blockers = items.filter((i) => i.level === "blocker");

  if (process.env.APP_ENV === "production" && blockers.length) {
    const list = blockers.map((b) => `  - ${b.title}: ${b.detail}`).join("\n");
    throw new Error(`No se puede iniciar en producción. Pendientes obligatorios:\n${list}`);
  }
  if (items.length) {
    console.warn(`[lanzamiento] ${items.length} pendientes antes de producción (ver /admin o npm run check:launch).`);
  }
}
