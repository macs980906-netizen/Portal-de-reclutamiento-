import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission, requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { NOTIFICATION_STATUS, channelStatus, dispatchPending, requeueUnconfigured } from "@/server/notifications/service";

const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" });

async function retryAction() {
  "use server";
  const user = await assertPermission("notifications:manage");
  const requeued = await requeueUnconfigured();
  const sent = await dispatchPending();
  await audit("NOTIFICATIONS_RETRY", { actorId: user.id, meta: { ...requeued, ...sent } });
  revalidatePath("/admin/notificaciones");
  redirect("/admin/notificaciones?ok=1");
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireUser("notifications:manage");
  const { ok } = await searchParams;
  const channels = await channelStatus();
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { application: { select: { id: true, code: true } }, cycle: { select: { id: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notificaciones al equipo</h1>
      {ok && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
          Reintento ejecutado.
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="a-card p-5 text-sm">
          <h2 className="font-bold">WhatsApp (canal preferido)</h2>
          <p className={`mt-2 font-semibold ${channels.whatsapp.configured ? "text-green-800" : "text-amber-800"}`}>
            {channels.whatsapp.configured
              ? `Configurado · ${channels.whatsapp.provider}`
              : channels.whatsapp.simulated
                ? "Simulado en consola (desarrollo): no envía mensajes"
                : "Notificación pendiente de configuración"}
          </p>
          <p className="mt-1">Destinatarios: {channels.whatsapp.recipients.length ? channels.whatsapp.recipients.join(", ") : "ninguno"}</p>
          {channels.whatsapp.shortlistTemplate === false && <p className="mt-1 text-amber-800">Falta la plantilla del aviso de shortlist.</p>}
          <p className="mt-1 text-zinc-600">Último envío: {channels.whatsapp.lastSentAt ? dateFmt.format(channels.whatsapp.lastSentAt) : "—"}</p>
        </div>
        <div className="a-card p-5 text-sm">
          <h2 className="font-bold">Correo (respaldo)</h2>
          <p className={`mt-2 font-semibold ${channels.email.configured ? "text-green-800" : "text-zinc-600"}`}>
            {channels.email.configured ? "Configurado · SMTP" : "No configurado"}
          </p>
          <p className="mt-1">Destinatarios: {channels.email.recipients.length ? channels.email.recipients.join(", ") : "ninguno"}</p>
          <p className="mt-1 text-zinc-600">Último envío: {channels.email.lastSentAt ? dateFmt.format(channels.email.lastSentAt) : "—"}</p>
        </div>
      </section>
      <p className="text-sm text-zinc-600">
        Destinatarios y credenciales se configuran con variables de entorno (ver README); no hay teléfonos ni correos en el
        código. Los avisos sólo incluyen nombre corto, agencia o conteos y un enlace que exige iniciar sesión. “Registrada en
        consola” nunca significa que se notificó a alguien.
      </p>
      <form action={retryAction}>
        <button type="submit" className="a-btn">
          Reintentar pendientes y fallidas
        </button>
      </form>

      <section className="a-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Historial de notificaciones</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600">
            <tr>
              <th scope="col" className="px-4 py-3">Fecha</th>
              <th scope="col" className="px-4 py-3">Aviso</th>
              <th scope="col" className="px-4 py-3">Destinatario</th>
              <th scope="col" className="px-4 py-3">Canal</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              <th scope="col" className="px-4 py-3">Intentos</th>
              <th scope="col" className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Sin notificaciones todavía.
                </td>
              </tr>
            )}
            {rows.map((n) => (
              <tr key={n.id}>
                <td className="whitespace-nowrap px-4 py-2">{dateFmt.format(n.sentAt ?? n.createdAt)}</td>
                <td className="px-4 py-2">
                  {n.kind === "SHORTLIST" && n.cycle ? (
                    <Link href={`/admin/convocatorias/${n.cycle.id}`} className="underline">
                      Shortlist · {n.cycle.name}
                    </Link>
                  ) : n.application ? (
                    <Link href={`/admin/postulaciones/${n.application.id}`} className="font-mono underline">
                      {n.application.code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {n.recipientLabel} <span className="text-zinc-500">{n.recipientMasked}</span>
                </td>
                <td className="px-4 py-2">
                  {n.channel} · {n.provider}
                </td>
                <td className="px-4 py-2 font-semibold">{NOTIFICATION_STATUS[n.status as keyof typeof NOTIFICATION_STATUS] ?? n.status}</td>
                <td className="px-4 py-2 tabular-nums">{n.attempts}</td>
                <td className="max-w-xs truncate px-4 py-2 text-zinc-600" title={n.lastError ?? ""}>
                  {n.lastError ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
