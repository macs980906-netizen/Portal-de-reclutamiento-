/**
 * Atribución de campañas (cliente). Se guarda en sessionStorage y sólo viaja a nuestro
 * servidor junto con la postulación. No se envía a Meta/Google ni a ningún píxel.
 */
const KEY = "rmx-attribution-v1";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = Partial<Record<(typeof UTM_KEYS)[number] | "referrer", string>>;

export function captureAttribution(): void {
  try {
    if (sessionStorage.getItem(KEY)) return; // conserva la primera atribución de la visita
    const params = new URLSearchParams(window.location.search);
    const data: Attribution = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) data[k] = v.slice(0, 150);
    }
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.host !== window.location.host) data.referrer = `${ref.origin}${ref.pathname}`.slice(0, 300);
    }
    if (Object.keys(data).length) sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* almacenamiento no disponible: se omite la atribución */
  }
}

export function readAttribution(): Attribution | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : undefined;
  } catch {
    return undefined;
  }
}
