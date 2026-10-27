export function escapeCsvCell(value: string): string {
  let safe = value;
  if (/^[\t\r ]*[=+\-@]/.test(safe) || safe.startsWith("\t") || safe.startsWith("\r")) {
    safe = `'${safe}`;
  }
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}
