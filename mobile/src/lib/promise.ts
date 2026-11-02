import { normalizeDigits } from '../api/sales';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Pure calendar math on ISO strings (no time zones). */
function addDays(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function promiseChoices(today: string): { label: string; date: string }[] {
  const [y, m] = today.split('-').map(Number);
  const next = m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1);
  return [
    { label: 'بكره', date: addDays(today, 1) },
    { label: 'بعد 3 أيام', date: addDays(today, 3) },
    { label: 'بعد أسبوع', date: addDays(today, 7) },
    { label: 'أول الشهر الجاي', date: next },
  ];
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `d/m` (next occurrence on or after tomorrow) or `d/m/yyyy`; separators `/` `-` `.`. Null when invalid or not after today. */
export function parseDayMonth(input: string, today: string): string | null {
  const m = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}))?$/.exec(normalizeDigits(input).trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const tomorrow = addDays(today, 1);
  if (m[3]) {
    const y = Number(m[3]);
    if (!validDate(y, mo, d)) return null;
    const r = iso(y, mo, d);
    return r > today ? r : null;
  }
  const ty = Number(today.slice(0, 4));
  for (const y of [ty, ty + 1, ty + 2, ty + 3, ty + 4]) {
    if (!validDate(y, mo, d)) continue; // e.g. 29/2 in a non-leap year
    const r = iso(y, mo, d);
    if (r >= tomorrow) return r;
  }
  return null;
}
