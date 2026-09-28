import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission, requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { parseRecipients } from "@/server/notifications/message";
import { getProvider } from "@/server/notifications/providers";
import { NOTIFICATION_STATUS, dispatchPending, requeueUnconfigured } from "@/server/notifications/service";

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
  const e = env();
  const provider = getProvider(e);
  const recipients = parseRecipients(e.NOTIFY_WHATSAPP_RECIPIENTS);
  const ready = Boolean(provider?.configured && recipients.length);
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { application: { select: { id: true, code: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notificaciones al equipo</h1>
      {ok && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
          Reintento ejecutado.
        </p>
      )}

      <section className="a-card p-5 text-sm">
        <h2 className="font-bold">Configuración</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Proveedor</dt>
            <dd className="font-semibold">{e.NOTIFY_PROVIDER}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Estado</dt>
            <dd className={`font-semibold ${ready ? "text-green-800" : "text-amber-800"}`}>
              {ready ? (provider?.id === "console" ? "Simulado en consola (desarrollo)" : "Listo para enviar") : "Requiere configuración"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Destinatarios</dt>
            <dd>{recipients.length ? recipients.map((r) => `${r.label} (${r.masked})`).join(", ") : "Ninguno configurado"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-zinc-600">
          Los destinatarios y credenciales se configuran con variables de entorno (ver README). El mensaje sólo incluye nombre,
          agencia preferida, puntaje orientativo y un enlace que requiere iniciar sesión.
        </p>
        <form action={retryAction} className="mt-4">
          <button type="submit" className="a-btn" disabled={!ready}>
            Reintentar pendientes y fallidas
          </button>
        </form>
      </section>

      <section className="a-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Historial de notificaciones</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600">
            <tr>
              <th scope="col" className="px-4 py-3">Fecha</th>
              <th scope="col" className="px-4 py-3">Postulación</th>
              <th scope="col" className="px-4 py-3">Destinatario</th>
              <th scope="col" className="px-4 py-3">Proveedor</th>
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
                <td className="whitespace-nowrap px-4 py-2">{dateFmt.format(n.createdAt)}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/postulaciones/${n.application.id}`} className="font-mono underline">
                    {n.application.code}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {n.recipientLabel} <span className="text-zinc-500">{n.recipientMasked}</span>
                </td>
                <td className="px-4 py-2">{n.provider}</td>
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
