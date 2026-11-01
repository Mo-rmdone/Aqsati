const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** Cairo calendar date (YYYY-MM-DD) of a timestamp, e.g. a timestamptz from the API. Unparseable -> "". */
export function localDateISO(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return CAIRO_DAY.format(d);
}

/** The instant (ISO string, UTC) at which the Cairo day of `now` began, DST-aware. */
export function cairoDayStart(now: Date = new Date()): string {
  const [y, m, d] = todayISO(now).split('-').map(Number);
  // Cairo is UTC+2 or UTC+3; the start of the day is whichever candidate formats back to 00:00 on that day.
  for (const offset of [3, 2]) {
    const cand = new Date(Date.UTC(y, m - 1, d, -offset));
    if (todayISO(cand) === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` && todayISO(new Date(cand.getTime() - 1)) !== todayISO(cand)) {
      return cand.toISOString();
    }
  }
  return new Date(Date.UTC(y, m - 1, d, -2)).toISOString();
}

const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Cairo calendar day (YYYY-MM-DD) of an instant, regardless of the device time zone. */
export function todayISO(now: Date = new Date()): string {
  return CAIRO_DAY.format(now);
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "الأحد 1 نوفمبر 2026": Cairo weekday + date, Latin digits. */
export function headerDateAr(now: Date = new Date()): string {
  const iso = todayISO(now);
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${formatDateAr(iso)}`;
}

const CAIRO_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "10:42 ص" / "3:05 م": Cairo clock time of a timestamp. Unparseable input -> "". */
export function timeAr(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const parts = CAIRO_TIME.formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const min = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${h < 12 ? 'ص' : 'م'}`;
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
