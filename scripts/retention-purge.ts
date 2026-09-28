/**
 * Aplica la política de retención (src/config/legal.ts → RETENTION).
 * Mientras los plazos sean `null` (pendientes de aprobación) NO borra nada.
 *   npm run retention:purge            → muestra cuántos expedientes se borrarían
 *   npm run retention:purge -- --apply → borra definitivamente (datos + CV)
 */
import { RETENTION } from "../src/config/legal";
import { prisma } from "../src/server/db";
import { deleteApplication } from "../src/server/applications";
import { audit } from "../src/server/audit";

async function main() {
  const { applicationDays, futureVacanciesDays } = RETENTION;
  if (applicationDays === null || futureVacanciesDays === null) {
    console.log("Política de retención pendiente de aprobación: no se borró nada.");
    return;
  }
  const apply = process.argv.includes("--apply");
  const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.application.findMany({
    where: {
      OR: [
        { futureVacanciesConsent: false, createdAt: { lt: cutoff(applicationDays) } },
        { futureVacanciesConsent: true, createdAt: { lt: cutoff(futureVacanciesDays) } },
      ],
      status: { notIn: ["CONTRATADO"] },
    },
    select: { id: true, code: true },
  });
  console.log(`${rows.length} expediente(s) fuera del plazo de conservación.`);
  if (!apply) {
    console.log("Ejecuta con --apply para borrarlos.");
    return;
  }
  for (const r of rows) {
    await deleteApplication(r.id);
    await audit("APPLICATION_DELETED", { targetId: r.code, meta: { reason: "retention" } });
  }
  console.log(`✔ ${rows.length} expediente(s) borrados.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
