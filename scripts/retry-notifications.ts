/** Reintenta notificaciones pendientes/fallidas (útil en un cron cada 10–15 min). */
import { prisma } from "../src/server/db";
import { dispatchPending, requeueUnconfigured } from "../src/server/notifications/service";

async function main() {
  const requeued = await requeueUnconfigured();
  const sent = await dispatchPending();
  console.log(`Reencoladas: ${requeued.requeued} · Intentadas: ${sent.attempted}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
