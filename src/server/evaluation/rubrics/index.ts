import "server-only";
import type { Rubric } from "../types";
import { RUBRIC_V1 } from "./v1";

/**
 * Registro de rúbricas. Para cambiarla: agrega `v2.ts`, regístrala aquí y cambia
 * `CURRENT_RUBRIC_VERSION`. Las convocatorias y evaluaciones existentes conservan la
 * versión con la que se crearon; nada se recalcula retroactivamente.
 */
const RUBRICS: Record<string, Rubric> = {
  [RUBRIC_V1.version]: RUBRIC_V1,
};

export const CURRENT_RUBRIC_VERSION = RUBRIC_V1.version;

export function getRubric(version: string): Rubric {
  const r = RUBRICS[version];
  if (!r) throw new Error(`Rúbrica desconocida: ${version}`);
  return r;
}

export function hasRubric(version: string): boolean {
  return version in RUBRICS;
}

/**
 * Registra una rúbrica adicional en tiempo de ejecución. Pensado para pruebas que verifican
 * que una versión nueva no altera evaluaciones anteriores; las versiones reales se agregan
 * al objeto RUBRICS de arriba.
 */
export function registerRubric(r: Rubric) {
  if (RUBRICS[r.version]) throw new Error(`La rúbrica ${r.version} ya existe`);
  RUBRICS[r.version] = r;
}
