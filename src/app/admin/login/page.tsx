import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { currentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Acceso al panel · RiderMex", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/admin");
  const { next } = await searchParams;
  return (
    <main className="admin flex min-h-dvh items-center justify-center px-4">
      <div className="a-card w-full max-w-sm p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-black p-1.5">
            <Logo size={44} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Panel de reclutamiento</h1>
            <p className="text-sm text-zinc-600">Acceso sólo para el equipo autorizado.</p>
          </div>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
