"use client";

import dynamic from "next/dynamic";

/** El formulario depende de sessionStorage (guardado temporal), así que se carga sólo en el navegador. */
export const WizardLoader = dynamic(() => import("./wizard").then((m) => m.Wizard), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center text-fog" role="status">
      Cargando formulario…
    </div>
  ),
});
