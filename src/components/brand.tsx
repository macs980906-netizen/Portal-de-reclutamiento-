/* eslint-disable @next/next/no-img-element -- imágenes estáticas pequeñas; no requieren optimización en servidor */
import Link from "next/link";

/**
 * Logo RiderMex recortado del arte de campaña (provisional).
 * Reemplazar `public/brand/ridermex-logo.png` por el archivo vectorial oficial.
 */
export function Logo({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/ridermex-logo.png"
      alt="RiderMex"
      width={size}
      height={Math.round(size * (134 / 160))}
      className={`logo-mask ${className}`}
      decoding="async"
    />
  );
}

/** Icono de documento con persona, como en el recuadro de llamado a la acción de los artes. */
export function ApplyIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M8 3h22l12 12v36a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" strokeLinejoin="round" />
      <path d="M30 3v12h12" strokeLinejoin="round" />
      <circle cx="23.5" cy="24" r="5.5" />
      <path d="M13 41c1.8-5.4 6-8 10.5-8S32.2 35.6 34 41" strokeLinecap="round" />
      <path d="M13 47h21" strokeLinecap="round" />
    </svg>
  );
}

/** Líneas rojas con brillo que flanquean el logo en los artes. */
export function LogoLockup({ size = 88 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center gap-4 sm:gap-8">
      <span className="glow-rule w-16 sm:w-32" aria-hidden="true" />
      <Logo size={size} />
      <span className="glow-rule w-16 sm:w-32" aria-hidden="true" />
    </div>
  );
}

export function Showroom({ className = "" }: { className?: string }) {
  return (
    <picture>
      <source srcSet="/brand/showroom.webp" type="image/webp" />
      <img
        src="/brand/showroom.jpg"
        alt=""
        width={1149}
        height={217}
        loading="lazy"
        decoding="async"
        className={`showroom pointer-events-none w-full object-cover ${className}`}
      />
    </picture>
  );
}

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
      <Link href="/" aria-label="RiderMex, inicio" className="rounded-md">
        <Logo size={56} />
      </Link>
      {cta && (
        <Link href="/postular" className="btn btn-primary min-h-[44px] px-4 py-2 text-sm">
          Postularme
        </Link>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-mute sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <p>Reclutamiento de asesores comerciales · RiderMex</p>
        </div>
        <nav aria-label="Enlaces legales" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacidad" className="underline underline-offset-4 hover:text-white">
            Aviso de privacidad
          </Link>
          <Link href="/postular" className="underline underline-offset-4 hover:text-white">
            Postularme
          </Link>
        </nav>
      </div>
      <p className="fineprint pb-8 text-center">Registro sujeto a evaluación de perfil</p>
    </footer>
  );
}
