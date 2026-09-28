import { describe, expect, it } from "vitest";
import { checkCv, safeDisplayName } from "@/server/file-validation";

const MB = 1024 * 1024;
const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));

const pdf = bytes("%PDF-1.7\n", "contenido");
const doc = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], "resto");
const docx = bytes([0x50, 0x4b, 0x03, 0x04], "....[Content_Types].xml....word/document.xml");
const exe = bytes("MZ\x90\x00", "binario");

describe("validación de CV", () => {
  it("acepta PDF, DOC y DOCX con firma real", () => {
    expect(checkCv("cv.pdf", pdf, 5 * MB)).toMatchObject({ ok: true, kind: { ext: "pdf" } });
    expect(checkCv("cv.DOC", doc, 5 * MB)).toMatchObject({ ok: true, kind: { ext: "doc" } });
    expect(checkCv("mi cv.docx", docx, 5 * MB)).toMatchObject({ ok: true, kind: { ext: "docx" } });
  });

  it("rechaza un ejecutable renombrado como PDF", () => {
    expect(checkCv("cv.pdf", exe, 5 * MB).ok).toBe(false);
  });

  it("rechaza un ZIP cualquiera renombrado como DOCX", () => {
    expect(checkCv("cv.docx", bytes([0x50, 0x4b, 0x03, 0x04], "otros archivos"), 5 * MB).ok).toBe(false);
  });

  it("rechaza extensiones no permitidas aunque el contenido sea PDF", () => {
    expect(checkCv("cv.html", pdf, 5 * MB).ok).toBe(false);
    expect(checkCv("cv.pdf.exe", pdf, 5 * MB).ok).toBe(false);
  });

  it("rechaza archivos vacíos o demasiado grandes", () => {
    expect(checkCv("cv.pdf", new Uint8Array(), 5 * MB).ok).toBe(false);
    const big = new Uint8Array(5 * MB + 1);
    big.set(pdf);
    expect(checkCv("cv.pdf", big, 5 * MB).ok).toBe(false);
  });

  it("sanea el nombre mostrado y elimina rutas", () => {
    expect(safeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayName('C:\\Users\\ana\\CV <final>".pdf')).toBe("CV _final__.pdf");
  });
});
