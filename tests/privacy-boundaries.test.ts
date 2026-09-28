import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";
import { notificationText, parseRecipients } from "@/server/notifications/message";
import { getLaunchBlockers } from "@/config/launch";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("límites de privacidad y seguridad", () => {
  it("ningún componente cliente importa código de servidor (clave de puntuación, BD, secretos)", () => {
    const files = walk(path.resolve(__dirname, "../src")).filter((f) => /\.(tsx?|jsx?)$/.test(f));
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /^\s*["']use client["']/.test(src) && /from\s+["'](@\/server|\.\.?\/.*server)\//.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("los módulos con la clave y la BD están marcados como sólo servidor", () => {
    for (const f of ["scoring/key.ts", "scoring/score.ts", "db.ts", "env.ts", "storage.ts", "auth.ts"]) {
      const src = readFileSync(path.resolve(__dirname, "../src/server", f), "utf8");
      expect(src).toMatch(/^import "server-only";/);
    }
  });

  it("la notificación no incluye teléfono, correo ni respuestas", () => {
    const text = notificationText({
      applicationId: "cabc123",
      firstName: "Ana",
      lastName: "Pérez",
      agency: "Coapa",
      score: 72.4,
      appUrl: "https://reclutamiento.example.com",
    });
    expect(text).toContain("Ana P.");
    expect(text).toContain("72/100");
    expect(text).toContain("https://reclutamiento.example.com/admin/postulaciones/cabc123");
    expect(text).not.toMatch(/\d{10}/);
    expect(text).not.toContain("@");
  });

  it("interpreta destinatarios de variables de entorno y los enmascara", () => {
    const r = parseRecipients("Abraham|+52 1 55 1111 2222, Verónica|+525533334444, inválido|123");
    expect(r.map((x) => x.label)).toEqual(["Abraham", "Verónica"]);
    expect(r[0]!.masked).toBe("•••• 2222");
  });

  it("neutraliza fórmulas en la exportación CSV", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+5215512345678")).toBe("'+5215512345678");
    expect(csvCell("Ana")).toBe("Ana");
  });

  it("producción queda bloqueada mientras falten datos legales y operativos", () => {
    const blockers = getLaunchBlockers({ APP_ENV: "production", APP_URL: "http://inseguro.example.com", HASH_SECRET: "dev-x" });
    const ids = blockers.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["privacy-notice", "retention", "agencies", "https", "hash-secret", "storage"]));
  });
});
