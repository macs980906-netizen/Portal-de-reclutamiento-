/**
 * Agencias RiderMex que pueden elegirse como preferencia.
 *
 * Fuente: información pública del sitio de RiderMex. Los horarios son de ATENCIÓN AL
 * PÚBLICO de cada agencia; NO son el horario laboral del puesto (ver `business.ts`).
 *
 * ⚠️ Antes de producción, RiderMex debe confirmar direcciones, operación actual y
 * horarios, y cambiar `AGENCIES_CONFIRMED` a `true`.
 */
export const AGENCIES_CONFIRMED = false;

export type Agency = {
  id: string;
  name: string;
  zone: string;
  address: string;
  publicHours: string[];
};

export const AGENCIES: readonly Agency[] = [
  {
    id: "naucalpan",
    name: "Naucalpan",
    zone: "Estado de México · Zona poniente",
    address:
      "Av. Dr. Gustavo Baz 98, Col. Alce Blanco, Naucalpan de Juárez, Estado de México, 53370",
    publicHours: ["Lunes a viernes 9:30–18:30", "Sábado 9:30–15:30"],
  },
  {
    id: "ceda",
    name: "CEDA / Central de Abasto",
    zone: "Ciudad de México · Iztapalapa",
    address: "Canal de Tezontle 1500, Central de Abasto, Iztapalapa, Ciudad de México, 09040",
    publicHours: ["Lunes a domingo 9:30–20:00"],
  },
  {
    id: "coapa",
    name: "Coapa",
    zone: "Ciudad de México · Tlalpan",
    address: "Calz. de Tlalpan 3604, Huipulco, Tlalpan, Ciudad de México, 14370",
    publicHours: ["Lunes a viernes 10:00–19:00", "Sábado 10:00–16:00", "Domingo cerrado"],
  },
  {
    id: "chalco",
    name: "Chalco",
    zone: "Estado de México · Zona oriente",
    address:
      "Francisco Javier Mina 13, Chalco Centro, Chalco de Díaz Covarrubias, Estado de México, 56600",
    publicHours: ["Lunes a viernes 10:00–19:00", "Sábado 10:00–14:00", "Domingo cerrado"],
  },
] as const;

/**
 * Quinta sucursal: aparece públicamente como "en preparación". No es seleccionable
 * hasta que RiderMex confirme su ubicación. Sólo se muestra como aviso informativo.
 */
export const UPCOMING_AGENCY_NOTE = "Próximamente una nueva sucursal (en preparación).";

export const AGENCY_IDS = AGENCIES.map((a) => a.id) as [string, ...string[]];

export function agencyName(id: string | null | undefined): string {
  if (!id) return "—";
  return AGENCIES.find((a) => a.id === id)?.name ?? id;
}

/** Enlace de búsqueda de Google Maps construido a partir de la dirección publicada. */
export function mapsUrl(agency: Agency): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `RiderMex ${agency.address}`,
  )}`;
}
