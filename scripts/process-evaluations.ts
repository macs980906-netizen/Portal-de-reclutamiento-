/** Evalúa postulaciones pendientes o fallidas (programable en cron cada 5–10 min). */
import { prisma } from "../src/server/db";
import { processPendingEvaluations } from "../src/server/evaluation/service";

processPendingEvaluations()
  .then((r) => console.log(`Procesadas: ${r.processed} · ${JSON.stringify(r.results)}`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
