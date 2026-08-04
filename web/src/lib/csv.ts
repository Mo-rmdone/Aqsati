// Shared CSV export for the three Task 11 reports. Centralized so the
// UTF-8 BOM prefix (required for Arabic text to open correctly in Excel,
// which otherwise guesses the wrong codepage and mangles the Arabic
// columns into "????") is applied in exactly one place instead of being
// re-typed — and possibly forgotten — in three separate report files.

/** Escapes a single CSV field per RFC 4180: wrap in quotes if it contains a
 * comma, quote, or newline; double any embedded quotes. */
function escapeCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}

/** Triggers a browser download of `content` as a CSV file, prefixed with a
 * UTF-8 BOM (U+FEFF) so Excel (which does not sniff UTF-8 by default,
 * unlike most other consumers) renders Arabic text correctly instead of
 * mis-decoding it as Windows-1252/CP1256. Written as the explicit escape
 * rather than a literal invisible character in source so it can't be
 * silently stripped by an editor/formatter/whitespace pass. */
export function downloadCsv(filename: string, content: string) {
  // Built with String.fromCharCode rather than a "﻿" string literal so
  // there is no invisible/zero-width character sitting in the source file
  // itself (which editors, formatters, or a stray whitespace-trim pass could
  // silently drop, quietly breaking the one thing this function exists for).
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
