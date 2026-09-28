import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { requireUser } from "@/server/auth";
import { can } from "@/lib/permissions";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = { title: "Panel de reclutamiento · RiderMex", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="admin min-h-dvh">
      <header className="bg-black text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 rounded">
            <Logo size={36} />
            <span className="font-bold">Reclutamiento</span>
          </Link>
          <nav aria-label="Panel" className="flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/admin" className="hover:underline">
              Resumen
            </Link>
            <Link href="/admin/postulaciones" className="hover:underline">
              Postulaciones
            </Link>
            {can(user.role, "notifications:manage") && (
              <Link href="/admin/notificaciones" className="hover:underline">
                Notificaciones
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-zinc-300">
              {user.name} · {user.role === "ADMIN" ? "Administración" : "Revisión"}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="rounded border border-zinc-600 px-3 py-1.5 hover:border-white">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
