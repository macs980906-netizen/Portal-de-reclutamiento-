import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS } from "@/config/business";
import { LogoLockup, Showroom } from "@/components/brand";

export const metadata: Metadata = {
  title: "Postulación recibida · RiderMex",
  robots: { index: false },
};

const CODE_RE = /^RMX-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export default async function GraciasPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams;
  const code = codigo && CODE_RE.test(codigo) ? codigo : null;

  return (
    <main className="stage flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 text-center">
        <LogoLockup size={80} />
        <h1 className="display mt-8 text-5xl sm:text-6xl">
          <span className="text-chrome block">¡Gracias!</span>
          <span className="text-fire block">Recibimos tu postulación</span>
        </h1>
        {code ? (
          <div className="panel panel-hot mx-auto mt-8 max-w-md p-6">
            <p className="kicker">Tu código de postulación</p>
            <p className="display mt-3 select-all text-4xl tracking-wider">{code}</p>
            <p className="mt-3 text-sm text-mute">Guárdalo: te sirve para cualquier aclaración sobre tu registro.</p>
          </div>
        ) : (
          <p className="mt-8 text-fog">Tu postulación quedó registrada.</p>
        )}
        <div className="mx-auto mt-8 max-w-xl space-y-4 text-lg text-fog">
          <p>
            El equipo RiderMex revisará tu solicitud y, si tu perfil coincide con una vacante, se pondrá en contacto contigo por
            teléfono o WhatsApp.
            {BUSINESS.contactTimeframe ? ` ${BUSINESS.contactTimeframe}` : ""}
          </p>
          <p>No necesitas escribir a una agencia para completar tu registro.</p>
        </div>
        <Link href="/" className="btn btn-ghost mt-10">
          Volver al inicio
        </Link>
      </div>
      <Showroom className="mt-12 h-32 sm:h-48" />
    </main>
  );
}
