const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** Local calendar date (YYYY-MM-DD) of a timestamp, e.g. a timestamptz from the API. */
export function localDateISO(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today's local calendar date (YYYY-MM-DD) — the shop's device clock, which is Cairo time in practice. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "2026-12-01" -> "1 ديسمبر 2026" (Arabic month, Latin digits). Unparseable input is returned as-is; empty -> "—". */
export function formatDateAr(iso: string): string {
  if (!iso) return '—';
  // A date, optionally followed by a time ("2026-12-01T…" / "2026-12-01 …"); anything else is not a date.
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth) return iso;
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}
