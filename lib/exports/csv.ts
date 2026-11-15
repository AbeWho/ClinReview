/**
 * CSV writer with formula-injection protection: spreadsheet apps execute cells beginning with
 * = + - @ (or tab/CR), so such cells are prefixed with a single quote. All cells are quoted.
 */
export function escapeCsvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}
