/**
 * CSV seguro para hojas de cálculo: escapa comillas y neutraliza fórmulas
 * (celdas que empiezan con = + - @ o tabulador) para evitar inyección de fórmulas.
 */
export function csvCell(value: string): string {
  let v = value.replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",;]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
