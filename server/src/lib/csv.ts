// A small RFC 4180 CSV reader: quoted fields, "" inside quotes, CRLF or LF, and the UTF-8 BOM
// that Excel adds. Enough for guest lists, no dependency needed.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        value += c;
      }
    } else if (c === '"' && value === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(value);
      value = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += c;
    }
  }
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Quotes a value for a CSV file when it needs it. */
export function csvCell(value: string | number | null | undefined) {
  let s = value === null || value === undefined ? "" : String(value);
  // A cell starting like a formula (=, @, or + / - not followed by a digit, e.g. "=HYPERLINK(…)")
  // would run in Excel: keep it as text. Phone numbers like +855… stay as they are.
  if (/^[=@\t\r]/.test(s) || /^[+-](?!\d)/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
