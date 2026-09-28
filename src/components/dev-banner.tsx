import Link from "next/link";
import { getLaunchItems } from "@/config/launch";

/**
 * Aviso inequívoco fuera de producción cuando faltan datos legales o comerciales.
 * (En producción el build y el envío de postulaciones se bloquean; ver `check:launch`.)
 */
export function DevBanner() {
  if (process.env.APP_ENV === "production") return null;
  const blockers = getLaunchItems().filter((i) => i.level === "blocker");
  if (!blockers.length) return null;
  return (
    <div role="note" className="relative z-20 border-b border-yellow-400/60 bg-yellow-300 px-4 py-2 text-center text-sm font-semibold text-black">
      Entorno de desarrollo · Faltan datos aprobados por RiderMex ({blockers.map((b) => b.title).join(", ")}).{" "}
      <Link href="/privacidad" className="underline">
        El aviso de privacidad es un placeholder.
      </Link>
    </div>
  );
}
