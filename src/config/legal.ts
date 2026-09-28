/**
 * Datos legales del aviso de privacidad (LFPDPPP).
 *
 * ⚠️ Esta plataforma NO es asesoría legal. Todos los campos `null` deben ser
 * completados y aprobados por RiderMex (y su asesoría legal) antes de publicar.
 * Mientras falten, el aviso se muestra como PLACEHOLDER y la verificación de
 * lanzamiento (`npm run check:launch`) bloquea el build de producción.
 */
export type LegalConfig = {
  /** Identidad del responsable (razón social). */
  controllerName: string | null;
  /** Domicilio del responsable para efectos del aviso. */
  controllerAddress: string | null;
  /** Medio para ejercer derechos ARCO y revocar consentimiento (correo o formulario). */
  arcoContact: string | null;
  /** Procedimiento ARCO aprobado (plazos de respuesta, requisitos de identificación). */
  arcoProcedure: string | null;
  /** Medios para limitar el uso o divulgación de los datos. */
  limitUseMechanism: string | null;
  /** Texto aprobado sobre plazos de conservación (debe coincidir con RETENTION). */
  retentionText: string | null;
  /** Transferencias y encargados (hospedaje, almacenamiento, mensajería), o "No se realizan". */
  transfersText: string | null;
  /** Medio por el que se comunican cambios al aviso. */
  changesMechanism: string | null;
  /**
   * Texto aprobado que informa que las respuestas del desafío (sin nombre, teléfono,
   * correo ni CV) se procesan con un proveedor externo de IA para una evaluación
   * orientativa revisada por personas. Debe nombrar al proveedor/encargado y su finalidad.
   */
  aiProcessingText: string | null;
  /** `true` sólo cuando RiderMex aprobó informar ese tratamiento en el aviso. */
  aiProcessingDisclosed: boolean;
  /** URL del aviso integral aprobado, si vive fuera de este sitio. */
  fullNoticeUrl: string | null;
  /** Texto aprobado del aviso integral (si se publica en este sitio). */
  fullNoticeApproved: boolean;
  /** Versión del aviso que se registra con cada consentimiento. */
  noticeVersion: string;
  /** Fecha de última actualización del aviso aprobado (AAAA-MM-DD). */
  noticeUpdatedAt: string | null;
};

export const LEGAL: LegalConfig = {
  controllerName: null,
  controllerAddress: null,
  arcoContact: null,
  arcoProcedure: null,
  limitUseMechanism: null,
  retentionText: null,
  transfersText: null,
  changesMechanism: null,
  aiProcessingText: null,
  aiProcessingDisclosed: false,
  fullNoticeUrl: null,
  fullNoticeApproved: false,
  noticeVersion: "placeholder-dev-0",
  noticeUpdatedAt: null,
};

/**
 * Política de retención. `null` = plazo pendiente de aprobación; el script de
 * purga no borra nada mientras siga en `null`.
 */
export const RETENTION = {
  /** Días que se conservan postulaciones SIN consentimiento para futuras vacantes. */
  applicationDays: null as number | null,
  /** Días que se conservan postulaciones CON consentimiento para futuras vacantes. */
  futureVacanciesDays: null as number | null,
};

export function isLegalComplete(l: LegalConfig = LEGAL): boolean {
  return Boolean(
    l.controllerName &&
      l.controllerAddress &&
      l.arcoContact &&
      l.arcoProcedure &&
      l.limitUseMechanism &&
      l.retentionText &&
      l.transfersText &&
      l.changesMechanism &&
      (l.fullNoticeApproved || l.fullNoticeUrl) &&
      l.noticeUpdatedAt &&
      !l.noticeVersion.startsWith("placeholder"),
  );
}
