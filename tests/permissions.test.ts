import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("permisos del panel", () => {
  it("sin sesión no hay ningún permiso", () => {
    expect(can(null, "applications:view")).toBe(false);
    expect(can(undefined, "cv:download")).toBe(false);
  });

  it("revisión: puede leer, calificar, anotar y descargar CV", () => {
    for (const p of ["applications:view", "applications:rate", "applications:note", "cv:download"] as const) {
      expect(can("REVIEWER", p)).toBe(true);
    }
  });

  it("revisión: no puede exportar, cambiar estado/prioridad, borrar ni gestionar notificaciones", () => {
    for (const p of ["export:csv", "applications:status", "applications:priority", "applications:delete", "notifications:manage"] as const) {
      expect(can("REVIEWER", p)).toBe(false);
    }
  });

  it("administración: puede exportar, cambiar estado y borrar", () => {
    expect(can("ADMIN", "export:csv")).toBe(true);
    expect(can("ADMIN", "applications:status")).toBe(true);
    expect(can("ADMIN", "applications:delete")).toBe(true);
  });
});
