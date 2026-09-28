/**
 * Condiciones comerciales de la vacante.
 *
 * Regla: todo valor `null` significa "por confirmar por RiderMex" y NO se muestra al
 * público. No completar con supuestos: sólo con información aprobada por el equipo.
 */
export type BusinessConfig = {
  /** Horario laboral del puesto (no confundir con el horario de atención de agencias). */
  jobSchedule: string | null;
  /** ¿El horario es el mismo en todas las agencias? `null` = sin confirmar. */
  sameScheduleAllAgencies: boolean | null;
  baseSalary: string | null;
  commissionScheme: string | null;
  benefits: string[] | null;
  contractType: string | null;
  /**
   * Cifra potencial de ingresos por comisiones. Oculta por defecto.
   * Sólo activar (`enabled: true`) cuando RiderMex valide la afirmación.
   */
  incomeClaim: {
    enabled: boolean;
    text: string;
    disclaimer: string;
  };
  /** Plazo de contacto comprometido. `null` = no se muestra ningún plazo. */
  contactTimeframe: string | null;
  /** Tiempo estimado del registro, medido sobre la implementación actual. */
  estimatedMinutes: string;
};

export const BUSINESS: BusinessConfig = {
  jobSchedule: null,
  sameScheduleAllAgencies: null,
  baseSalary: null,
  commissionScheme: null,
  benefits: null,
  contractType: null,
  incomeClaim: {
    enabled: false,
    text: "Ingreso potencial de hasta $30,000 MXN mensuales por comisiones",
    disclaimer:
      "Cifra potencial, no fija ni garantizada. Depende de las condiciones reales de la vacante y de los resultados individuales.",
  },
  contactTimeframe: null,
  estimatedMinutes: "6 a 9 minutos",
};

export const COMPENSATION_FALLBACK =
  "Durante la entrevista te explicaremos el esquema de compensación y el horario de la vacante en la agencia de tu interés.";

export function hasConfirmedOffer(b: BusinessConfig = BUSINESS): boolean {
  return Boolean(b.baseSalary || b.commissionScheme || b.benefits?.length || b.contractType);
}
