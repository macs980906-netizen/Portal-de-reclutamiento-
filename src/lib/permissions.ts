/**
 * Permisos del panel por rol.
 * - REVIEWER: revisa expedientes, ve contacto (queda registrado), descarga CV, califica y anota.
 * - ADMIN: además cambia estado y prioridad, exporta CSV, borra expedientes (ARCO) y
 *   gestiona notificaciones.
 */
export type Role = "ADMIN" | "REVIEWER";

export type Permission =
  | "applications:view"
  | "applications:rate"
  | "applications:note"
  | "applications:status"
  | "applications:priority"
  | "applications:delete"
  | "cv:download"
  | "export:csv"
  | "notifications:manage"
  | "launch:view";

const MATRIX: Record<Role, readonly Permission[]> = {
  REVIEWER: ["applications:view", "applications:rate", "applications:note", "cv:download", "launch:view"],
  ADMIN: [
    "applications:view",
    "applications:rate",
    "applications:note",
    "applications:status",
    "applications:priority",
    "applications:delete",
    "cv:download",
    "export:csv",
    "notifications:manage",
    "launch:view",
  ],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}
