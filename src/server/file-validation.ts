/**
 * Validación de CV por contenido real (firma de bytes), extensión y tamaño.
 * No confía en el `Content-Type` enviado por el navegador.
 */

export type CvKind = { ext: "pdf" | "doc" | "docx"; mime: string };

export type CvCheck = { ok: true; kind: CvKind } | { ok: false; error: string };

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc (Compound File)
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK.. (.docx es un ZIP)

const startsWith = (buf: Uint8Array, sig: number[]) => sig.every((b, i) => buf[i] === b);

function includesAscii(buf: Uint8Array, needle: string): boolean {
  const n = Buffer.from(needle, "latin1");
  return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).includes(n);
}

export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
}

export function checkCv(filename: string, bytes: Uint8Array, maxBytes: number): CvCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.byteLength > maxBytes) {
    return { ok: false, error: `El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  const ext = extensionOf(filename);
  if (ext === "pdf" && startsWith(bytes, PDF)) {
    return { ok: true, kind: { ext: "pdf", mime: "application/pdf" } };
  }
  if (ext === "doc" && startsWith(bytes, OLE)) {
    return { ok: true, kind: { ext: "doc", mime: "application/msword" } };
  }
  if (
    ext === "docx" &&
    startsWith(bytes, ZIP) &&
    includesAscii(bytes, "[Content_Types].xml") &&
    includesAscii(bytes, "word/")
  ) {
    return {
      ok: true,
      kind: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    };
  }
  if (!["pdf", "doc", "docx"].includes(ext)) {
    return { ok: false, error: "Sólo aceptamos CV en PDF, DOC o DOCX." };
  }
  return { ok: false, error: "El contenido del archivo no corresponde a un PDF, DOC o DOCX válido." };
}

/** Nombre original saneado, sólo para mostrarlo al equipo (nunca se usa como ruta). */
export function safeDisplayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "cv";
  const cleaned = base
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "cv";
}
