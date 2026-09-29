/**
 * Simulador mínimo de Google Apps Script para probar `google-apps-script/Code.gs` en Node.
 * Implementa sólo lo que usa el script (hojas como matrices, propiedades, Drive y lock).
 * No evalúa fórmulas de Google Sheets: las guarda como texto para inspeccionarlas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

type Cell = string | number;

function a1(ref: string): { row: number; col: number; rows: number; cols: number } {
  const parse = (r: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(r)!;
    const col = m[1]!.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    return { row: Number(m[2]), col };
  };
  const [s, e] = ref.split(":");
  const a = parse(s!);
  const b = e ? parse(e) : a;
  return { row: a.row, col: a.col, rows: b.row - a.row + 1, cols: b.col - a.col + 1 };
}

class FakeSheet {
  grid: Cell[][] = [];
  formulas = new Map<string, string>();
  hidden = new Set<number>();
  /** Valores tal como los envió el script (antes de que Sheets quite el apóstrofo). */
  rawAppends: Cell[][] = [];
  constructor(public name: string) {}
  private set(r: number, c: number, v: Cell) {
    while (this.grid.length < r) this.grid.push([]);
    const row = this.grid[r - 1]!;
    while (row.length < c) row.push("");
    // Como Sheets: un apóstrofo inicial fuerza texto y no se guarda.
    row[c - 1] = typeof v === "string" && v.startsWith("'") ? v.slice(1) : v;
  }
  private get(r: number, c: number): Cell {
    return this.grid[r - 1]?.[c - 1] ?? "";
  }
  getLastRow() {
    for (let i = this.grid.length; i > 0; i--) if (this.grid[i - 1]!.some((v) => v !== "")) return i;
    return 0;
  }
  getLastColumn() {
    return Math.max(0, ...this.grid.map((r) => r.reduce<number>((m, v, i) => (v !== "" ? i + 1 : m), 0)));
  }
  getRange(a: number | string, b?: number, rows = 1, cols = 1) {
    const g = typeof a === "string" ? a1(a) : { row: a, col: b!, rows, cols };
    const range = {
      setValue: (v: Cell) => { this.set(g.row, g.col, v); return range; },
      getValue: () => this.get(g.row, g.col),
      getDisplayValue: () => String(this.formulas.get(`${g.row},${g.col}`) ?? this.get(g.row, g.col)),
      getValues: () =>
        Array.from({ length: g.rows }, (_, i) => Array.from({ length: g.cols }, (_, j) => this.get(g.row + i, g.col + j))),
      setValues: (vals: Cell[][]) => { vals.forEach((r, i) => r.forEach((v, j) => this.set(g.row + i, g.col + j, v))); return range; },
      setFormula: (f: string) => { this.formulas.set(`${g.row},${g.col}`, f); this.set(g.row, g.col, ""); return range; },
      clearContent: () => {
        for (let i = 0; i < g.rows; i++) for (let j = 0; j < g.cols; j++) this.set(g.row + i, g.col + j, "");
        return range;
      },
      setFontWeight: () => range,
    };
    return range;
  }
  appendRow(values: Cell[]) { this.rawAppends.push(values); const r = this.getLastRow() + 1; values.forEach((v, i) => this.set(r, i + 1, v)); }
  setFrozenRows() {}
  setFrozenColumns() {}
  setColumnWidth() {}
  hideColumns(c: number) { this.hidden.add(c); }
  /** Filas como objetos { encabezado: valor } (ayuda para pruebas). */
  records() {
    const [h, ...rows] = this.grid;
    return rows.filter((r) => r.some((v) => v !== "")).map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? ""])));
  }
}

export function loadAppsScript(secret = "s".repeat(32)) {
  const sheets = new Map<string, FakeSheet>();
  const props = new Map<string, string>([["SECRET", secret]]);
  const files: { name: string; mime: string; bytes: number }[] = [];
  const ss = {
    getSheetByName: (n: string) => sheets.get(n) ?? null,
    insertSheet: (n: string) => { const s = new FakeSheet(n); sheets.set(n, s); return s; },
    getUrl: () => "https://docs.google.com/spreadsheets/d/FAKE",
    toast: () => {},
  };
  const folder = {
    getId: () => "FOLDER1",
    createFile: (blob: { name: string; mime: string; bytes: Uint8Array }) => {
      files.push({ name: blob.name, mime: blob.mime, bytes: blob.bytes.length });
      return { getUrl: () => `https://drive.google.com/file/d/${files.length}/view` };
    },
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s: string) => ({ content: s, setMimeType() { return this; } }) },
    Utilities: {
      base64Decode: (b: string) => new Uint8Array(Buffer.from(b, "base64")),
      newBlob: (bytes: Uint8Array, mime: string, name: string) => ({ bytes, mime, name }),
    },
    DriveApp: { createFolder: () => folder, getFolderById: () => folder },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(path.resolve(__dirname, "../../google-apps-script/Code.gs"), "utf8"), context);
  const g = context as unknown as { doPost: (e: { postData: { contents: string } }) => { content: string } };
  return {
    post(body: unknown) {
      return JSON.parse(g.doPost({ postData: { contents: JSON.stringify(body) } }).content) as Record<string, unknown>;
    },
    sheet: (name: string) => sheets.get(name),
    files,
  };
}
